"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, projectStageProgress, projects, stageHistory } from "@/lib/db/schema";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { canEnterStage, evaluateGate, stageByNo } from "@/lib/workflow/stages";
import { buildSnapshot, completedStages } from "@/lib/workflow/snapshot";

export type StageResult =
  | { ok: true; nextStage: number }
  | { ok: false; error: string; outstanding?: string[] };

/**
 * Marks a stage complete and opens the next one.
 *
 * The gate is evaluated here, on the server, against the database — never
 * trusting whatever the page last rendered. An admin may push past an unmet
 * gate, but only with a written reason, and the reason is recorded.
 */
export async function completeStage(
  projectId: string,
  stageNo: number,
  overrideReason?: string,
): Promise<StageResult> {
  const actor = await getActor();
  assertCan(actor, "stage.advance");

  const stage = stageByNo(stageNo);
  if (!stage) return { ok: false, error: "No such stage." };

  if (stage.adminOnly && actor.role !== "ADMIN") {
    return { ok: false, error: "Only an admin can complete this stage." };
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  const done = await completedStages(projectId);
  if (!canEnterStage(stageNo, done)) {
    return { ok: false, error: "An earlier stage is still open." };
  }

  const snapshot = await buildSnapshot(projectId);
  const gate = evaluateGate(stageNo, snapshot);

  const overriding = !gate.passed;
  if (overriding) {
    if (!can(actor, "stage.override")) {
      return {
        ok: false,
        error: "This stage is not finished yet.",
        outstanding: gate.outstanding.map((i) => i.id),
      };
    }
    if (!overrideReason || overrideReason.trim().length < 10) {
      return {
        ok: false,
        error: "Pushing past an unmet gate needs a written reason of at least 10 characters.",
        outstanding: gate.outstanding.map((i) => i.id),
      };
    }
  }

  const nextStage = Math.min(stageNo + 1, 9);

  await db.transaction(async (tx) => {
    await tx
      .update(projectStageProgress)
      .set({ status: "complete", completedBy: actor.id, completedAt: new Date() })
      .where(
        and(
          eq(projectStageProgress.projectId, projectId),
          eq(projectStageProgress.stageNo, stageNo),
        ),
      );

    if (nextStage !== stageNo) {
      await tx
        .update(projectStageProgress)
        .set({ status: "in_progress" })
        .where(
          and(
            eq(projectStageProgress.projectId, projectId),
            eq(projectStageProgress.stageNo, nextStage),
          ),
        );
    }

    // Stage 2 closing is what turns a prospect into a customer: the
    // agreement is signed and on file.
    const becomesCustomer = stageNo >= 2 && project.lifecycleStage !== "CUSTOMER";

    await tx
      .update(projects)
      .set({
        pipelineStage: nextStage,
        stageEnteredAt: new Date(),
        updatedAt: new Date(),
        ...(becomesCustomer ? { lifecycleStage: "CUSTOMER" as const } : {}),
        ...(stageNo === 9 ? { closedAt: new Date() } : {}),
      })
      .where(eq(projects.id, projectId));

    await tx.insert(stageHistory).values({
      projectId,
      fromStage: stageNo,
      toStage: nextStage,
      actorId: actor.id,
      note: `Stage ${stageNo} complete`,
      overrideReason: overriding ? overrideReason!.trim() : null,
    });

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: overriding ? "stage.override" : "stage.complete",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { stage: stageNo },
      after: { stage: nextStage },
      reason: overriding ? overrideReason!.trim() : null,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath("/dashboard");
  return { ok: true, nextStage };
}
