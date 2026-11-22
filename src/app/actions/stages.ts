"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, projectStageProgress, projects, stageHistory } from "@/lib/db/schema";
import { assertCan, can, hasRole } from "@/lib/rbac/permissions";
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
 * trusting whatever the page last rendered. Pushing past an unmet gate is
 * recorded as an override, with a reason if one was given.
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

  if (stage.adminOnly && !hasRole(actor, "ADMIN")) {
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
    // The reason is optional; the override itself is still recorded.
  }
  const reasonNote = overrideReason?.trim() || null;

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

    // Installation is what turns a prospect into a customer. Saving the
    // installation date does it too (installation.ts); this covers a stage 3
    // closed past its gate.
    const becomesCustomer = stageNo >= 3 && project.lifecycleStage === "PROSPECT";

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
      overrideReason: overriding ? reasonNote : null,
    });

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: overriding ? "stage.override" : "stage.complete",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { stage: stageNo },
      after: { stage: nextStage },
      reason: overriding ? reasonNote : null,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath("/dashboard");
  return { ok: true, nextStage };
}

/**
 * Ticks (or unticks) one stage by hand, from that stage's own page.
 *
 * Unlike `completeStage` this does not insist on order: the office often
 * finishes a later stage — the meter is paid, the DCR certificate is in —
 * while an earlier one still waits on paperwork, and wants the tick to say
 * so. Ticking over an unmet gate takes an optional reason, and both
 * directions are audit-logged — an override is recorded as one either way.
 *
 * The project's current stage is recomputed afterwards as the first stage
 * not yet ticked, so the overview always points at the real gap.
 */
export async function setStageCompletion(
  projectId: string,
  stageNo: number,
  complete: boolean,
  reason?: string,
): Promise<StageResult> {
  const actor = await getActor();
  assertCan(actor, "stage.advance");

  const stage = stageByNo(stageNo);
  if (!stage) return { ok: false, error: "No such stage." };
  if (stage.adminOnly && !hasRole(actor, "ADMIN")) {
    return { ok: false, error: "Only an admin can change this stage." };
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  const done = await completedStages(projectId);
  if (complete === done.has(stageNo)) {
    return { ok: true, nextStage: project.pipelineStage };
  }

  let overriding = false;
  if (complete) {
    const gate = evaluateGate(stageNo, await buildSnapshot(projectId));
    overriding = !gate.passed;
    if (overriding) {
      if (!can(actor, "stage.override")) {
        return {
          ok: false,
          error: "This stage is not finished yet.",
          outstanding: gate.outstanding.map((i) => i.id),
        };
      }
      // A reason is welcome but not required: the audit row still records
      // that the tick went over an unmet gate, and by whom.
    }
  }

  if (complete) done.add(stageNo);
  else done.delete(stageNo);

  let nextStage = 9;
  for (let i = 1; i <= 9; i++) {
    if (!done.has(i)) {
      nextStage = i;
      break;
    }
  }
  const allDone = done.size >= 9;
  const note = reason?.trim() || null;

  await db.transaction(async (tx) => {
    await tx
      .insert(projectStageProgress)
      .values({
        projectId,
        stageNo,
        status: complete ? "complete" : stageNo === nextStage ? "in_progress" : "not_started",
        completedBy: complete ? actor.id : null,
        completedAt: complete ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [projectStageProgress.projectId, projectStageProgress.stageNo],
        set: {
          status: complete ? "complete" : stageNo === nextStage ? "in_progress" : "not_started",
          completedBy: complete ? actor.id : null,
          completedAt: complete ? new Date() : null,
        },
      });

    if (!done.has(nextStage) && nextStage !== stageNo) {
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

    const becomesCustomer =
      complete && stageNo >= 3 && project.lifecycleStage === "PROSPECT";

    await tx
      .update(projects)
      .set({
        pipelineStage: nextStage,
        ...(nextStage !== project.pipelineStage ? { stageEnteredAt: new Date() } : {}),
        updatedAt: new Date(),
        ...(becomesCustomer ? { lifecycleStage: "CUSTOMER" as const } : {}),
        closedAt: allDone ? (project.closedAt ?? new Date()) : null,
      })
      .where(eq(projects.id, projectId));

    await tx.insert(stageHistory).values({
      projectId,
      fromStage: project.pipelineStage,
      toStage: nextStage,
      actorId: actor.id,
      note: complete ? `Stage ${stageNo} ticked complete` : `Stage ${stageNo} reopened`,
      overrideReason: overriding ? note : null,
    });

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: complete ? (overriding ? "stage.override" : "stage.complete") : "stage.reopen",
      entityType: "project",
      entityId: projectId,
      projectId,
      before: { stage: stageNo, complete: !complete },
      after: { stage: stageNo, complete },
      reason: note,
    });
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true, nextStage };
}
