"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, externalRefs } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type CommissioningStep = "commissioning" | "export";
export type CommissioningResult = { ok: true } | { ok: false; error: string };

/**
 * Stage 8's two ticks: commissioning completed, and export started.
 *
 * They are separate events — the DISCOM commissions the system, and only
 * afterwards does the net meter start exporting — so export cannot be ticked
 * before commissioning, and unticking commissioning takes export with it.
 */
export async function setCommissioningStep(
  projectId: string,
  step: CommissioningStep,
  done: boolean,
): Promise<CommissioningResult> {
  const actor = await getActor();
  assertCan(actor, "document.generate");

  const [current] = await db
    .select({
      commissioningCompletedAt: externalRefs.commissioningCompletedAt,
      exportStartedAt: externalRefs.exportStartedAt,
    })
    .from(externalRefs)
    .where(eq(externalRefs.projectId, projectId))
    .limit(1);

  const now = new Date();
  let set: { commissioningCompletedAt?: Date | null; exportStartedAt?: Date | null };
  if (step === "commissioning") {
    set = done
      ? { commissioningCompletedAt: current?.commissioningCompletedAt ?? now }
      : { commissioningCompletedAt: null, exportStartedAt: null };
  } else {
    if (done && !current?.commissioningCompletedAt) {
      return { ok: false, error: "Mark commissioning completed first." };
    }
    set = { exportStartedAt: done ? (current?.exportStartedAt ?? now) : null };
  }

  await db
    .insert(externalRefs)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: externalRefs.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: `commissioning.${step}.${done ? "marked" : "unmarked"}`,
    entityType: "external_refs",
    entityId: projectId,
    projectId,
    before: current ?? null,
    after: set,
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  return { ok: true };
}
