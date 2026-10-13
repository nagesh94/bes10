"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  applicationDetails,
  auditLog,
  contacts,
  projectStageProgress,
  projects,
  stageHistory,
} from "@/lib/db/schema";
import { newId, nextProjectCode } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import {
  convertToProspectSchema,
  newLeadSchema,
  type NewLeadInput,
} from "@/lib/validation/lead";

export type ActionResult =
  | { ok: true; projectId: string; code?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createLead(raw: NewLeadInput): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, "lead.write");

  const parsed = newLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;

  const contactId = newId("con");
  const projectId = newId("prj");

  const code = await db.transaction(async (tx) => {
    const code = await nextProjectCode(tx as unknown as typeof db);

    await tx.insert(contacts).values({
      id: contactId,
      firstName: input.firstName,
      lastName: input.lastName || null,
      phone: input.phone,
      email: input.email || null,
      address: input.address || null,
      pinCode: input.pinCode || null,
    });

    await tx.insert(projects).values({
      id: projectId,
      code,
      contactId,
      lifecycleStage: "LEAD",
      pipelineStage: 1,
      leadStatus: "NEW",
      leadSource: input.leadSource,
      referredByPartnerId: input.leadSource === "REFERRAL" ? input.partnerId || null : null,
      interestedPlantKw: input.interestedPlantKw || null,
      assignedEmployeeId: input.assignedEmployeeId || actor.id,
      createdBy: actor.id,
    });

    // Stage rows exist from the start so the rail renders without special-casing.
    await tx.insert(projectStageProgress).values(
      Array.from({ length: 9 }, (_, i) => ({
        projectId,
        stageNo: i + 1,
        status: i === 0 ? ("in_progress" as const) : ("not_started" as const),
      })),
    );

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "lead.create",
      entityType: "project",
      entityId: projectId,
      projectId,
      after: { code, name: `${input.firstName} ${input.lastName ?? ""}`.trim() },
    });

    return code;
  });

  revalidatePath("/leads");
  return { ok: true, projectId, code };
}

/**
 * Lead → Prospect.
 *
 * Nothing moves: the same row changes status. That keeps the history, the
 * project code and every document already attached to it.
 */
export async function convertToProspect(raw: {
  projectId: string;
  nationalPortalId: string;
}): Promise<ActionResult> {
  const actor = await getActor();
  assertCan(actor, "lead.convert");

  const parsed = convertToProspectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "A National Portal ID is needed before a lead can become a prospect.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { projectId, nationalPortalId } = parsed.data;

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  if (project.lifecycleStage !== "LEAD") {
    return { ok: false, error: "This project has already been converted." };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(applicationDetails)
      .values({
        projectId,
        nationalPortalId,
        applicationDate: new Date().toISOString().slice(0, 10),
      })
      .onConflictDoUpdate({
        target: applicationDetails.projectId,
        set: { nationalPortalId },
      });

    await tx
      .update(projects)
      .set({ lifecycleStage: "PROSPECT", leadStatus: "READY_TO_CONVERT", updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    await tx.insert(stageHistory).values({
      projectId,
      fromStage: 1,
      toStage: 1,
      actorId: actor.id,
      note: `Converted to prospect · ${nationalPortalId}`,
    });

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "lead.convert",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { lifecycleStage: "LEAD" },
      after: { lifecycleStage: "PROSPECT", nationalPortalId },
    });
  });

  revalidatePath("/leads");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, projectId };
}
