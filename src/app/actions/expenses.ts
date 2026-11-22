"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { expenseCategories, expenses, projects, user } from "@/lib/db/schema";
import { PAID_OUT_MODES, type PaidOutMode } from "@/lib/payments/schedule";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Recording money going out.
 *
 * Behind `money.write`, like every other amount: an employee calling this
 * gets a ForbiddenError before anything is read. The category decides what
 * else is required — a person for salary and personal use, a description
 * for "Other" — and that is checked here, not only in the form.
 */

export type ExpenseResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

export interface ExpenseInput {
  spentOn: string;
  amount: string;
  categoryId: number;
  projectId?: string | null;
  paidTo?: string;
  mode: PaidOutMode;
  referenceNo?: string;
  /** A staff member — or null with `personName` typed for someone else. */
  personUserId?: string | null;
  personName?: string;
  details?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | undefined | null, max = 300) => (v ?? "").trim().slice(0, max) || null;

function refresh(projectId: string | null) {
  revalidatePath("/finance", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}/payments`);
}

export async function recordExpense(input: ExpenseInput): Promise<ExpenseResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const amount = Number(String(input.amount).replace(/[,\s₹]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter the amount spent.", field: "amount" };
  }
  if (amount > 1e9) return { ok: false, error: "That amount looks wrong.", field: "amount" };
  if (!ISO.test(input.spentOn)) return { ok: false, error: "Enter the date it was spent.", field: "spentOn" };
  if (!(PAID_OUT_MODES as readonly string[]).includes(input.mode)) {
    return { ok: false, error: "Choose how it was paid.", field: "mode" };
  }

  const [category] = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.id, Number(input.categoryId)))
    .limit(1);
  if (!category || !category.active) {
    return { ok: false, error: "Choose what the money was spent on.", field: "categoryId" };
  }

  let projectId: string | null = null;
  if (input.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project) return { ok: false, error: "That project no longer exists.", field: "projectId" };
    projectId = project.id;
  }

  // A staff member's own name is stored, so the row still reads correctly if
  // the account is later renamed or disabled.
  let personUserId: string | null = null;
  let personName = clean(input.personName, 120);
  if (input.personUserId) {
    const [person] = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, input.personUserId))
      .limit(1);
    if (!person) return { ok: false, error: "That person is no longer a user.", field: "person" };
    personUserId = person.id;
    personName = person.name;
  }
  if (category.needsPerson && !personName) {
    return { ok: false, error: `Say who this ${category.name.toLowerCase()} was for.`, field: "person" };
  }

  const details = clean(input.details, 500);
  if (category.needsDetail && (!details || details.length < 3)) {
    return {
      ok: false,
      error: "Say what the money was for and where it was used.",
      field: "details",
    };
  }

  const id = newId("exp");
  const row = {
    id,
    spentOn: input.spentOn,
    amount: amount.toFixed(2),
    categoryId: category.id,
    projectId,
    paidTo: clean(input.paidTo, 160),
    mode: input.mode,
    referenceNo: clean(input.referenceNo, 80),
    personUserId,
    personName,
    details,
    recordedBy: actor.id,
  };
  await db.insert(expenses).values(row);

  await writeAudit({
    actorId: actor.id,
    action: "expense.record",
    entityType: "expense",
    entityId: id,
    projectId,
    after: { ...row, category: category.name },
  });

  refresh(projectId);
  return { ok: true };
}

/**
 * Removing an expense keeps the row — `deleted_at` is set and it stops being
 * counted — so the audit log can still show what was there and why it went.
 */
export async function deleteExpense(id: string, reason?: string): Promise<ExpenseResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);
  if (!row) return { ok: false, error: "That expense is already gone." };

  await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id));
  await writeAudit({
    actorId: actor.id,
    action: "expense.delete",
    entityType: "expense",
    entityId: id,
    projectId: row.projectId,
    before: row,
    reason: reason?.trim() || null,
  });

  refresh(row.projectId);
  return { ok: true };
}
