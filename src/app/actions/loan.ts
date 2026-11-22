"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, documents, financeApplications, paymentPlans } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { involvesFinance } from "@/lib/workflow/stages";

export type LoanResult = { ok: true } | { ok: false; error: string };

/**
 * "The loan has been applied for on Jan Samarth", ticked by hand.
 *
 * Uploading the digital approval letter already says so. This is for the
 * office that has applied but does not want to (or cannot yet) upload the
 * letter. It only moves the status between NOT_APPLIED and APPLIED — no
 * amount is read or written, so it sits under `project.write` like the rest
 * of the pipeline list, not under the money permissions. A loan that the
 * bank has already moved past APPLIED (sanctioned, disbursed, rejected) is
 * left alone; that is the Finance section's to change.
 */
export async function setLoanApplied(projectId: string, applied: boolean): Promise<LoanResult> {
  const actor = await getActor();
  assertCan(actor, "project.write");

  const [plan] = await db
    .select({ mode: paymentPlans.mode })
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);
  if (!plan || !involvesFinance(plan.mode)) {
    return { ok: false, error: "Only a finance or split project has a loan." };
  }

  const [current] = await db
    .select({ status: financeApplications.status })
    .from(financeApplications)
    .where(eq(financeApplications.projectId, projectId))
    .limit(1);
  const status = current?.status ?? "NOT_APPLIED";
  if (status !== "NOT_APPLIED" && status !== "APPLIED") {
    return { ok: false, error: "The loan has moved on past applied — change it from Finance." };
  }

  if (!applied) {
    // The letter is the stronger proof; while it is on file the tick cannot
    // take it back, or the list would say "not applied" over an uploaded letter.
    const [letter] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.docType, "DIGITAL_APPROVAL_LETTER"),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    if (letter) {
      return { ok: false, error: "The digital approval letter is uploaded, so the loan stays applied." };
    }
  }

  const set = applied
    ? { status: "APPLIED" as const, appliedOn: new Date().toISOString().slice(0, 10), updatedAt: new Date() }
    : { status: "NOT_APPLIED" as const, appliedOn: null, updatedAt: new Date() };

  await db
    .insert(financeApplications)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: financeApplications.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: applied ? "loan.marked_applied" : "loan.unmarked_applied",
    entityType: "finance_application",
    entityId: projectId,
    projectId,
    before: { status },
    after: { status: set.status },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/finance", "layout");
  return { ok: true };
}
