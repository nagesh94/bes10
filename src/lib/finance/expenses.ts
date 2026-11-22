import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, expenseCategories, expenses, projects, user } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Money going out, for the finance tabs and the project payments page.
 *
 * Reads every live expense in one query; the office records a few a day, so
 * filtering in memory is cheaper than a query per filter and keeps the
 * figures on the dashboard and the expenses tab computed the same way.
 */

export interface ExpenseRow {
  id: string;
  spentOn: string;
  amount: number;
  categoryId: number;
  category: string;
  perSite: boolean;
  projectId: string | null;
  projectCode: string | null;
  customer: string | null;
  paidTo: string | null;
  mode: string;
  referenceNo: string | null;
  personName: string | null;
  details: string | null;
}

export async function loadExpenses(): Promise<ExpenseRow[]> {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const rows = await db
    .select({
      id: expenses.id,
      spentOn: expenses.spentOn,
      amount: expenses.amount,
      categoryId: expenses.categoryId,
      category: expenseCategories.name,
      perSite: expenseCategories.perSite,
      projectId: expenses.projectId,
      projectCode: projects.code,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      paidTo: expenses.paidTo,
      mode: expenses.mode,
      referenceNo: expenses.referenceNo,
      personName: expenses.personName,
      details: expenses.details,
    })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(contacts, eq(contacts.id, projects.contactId))
    .where(isNull(expenses.deletedAt))
    .orderBy(desc(expenses.spentOn), desc(expenses.recordedAt));

  return rows.map(({ firstName, lastName, amount, ...r }) => ({
    ...r,
    amount: Number(amount) || 0,
    customer: r.projectId ? [firstName, lastName].filter(Boolean).join(" ") || null : null,
  }));
}

/** Spend per project, for margins. Overhead (no project) is left out. */
export function spendByProject(rows: ExpenseRow[]) {
  const by = new Map<string, number>();
  for (const r of rows) if (r.projectId) by.set(r.projectId, (by.get(r.projectId) ?? 0) + r.amount);
  return by;
}

export interface ExpenseCategoryOption {
  id: number;
  name: string;
  hint: string | null;
  needsPerson: boolean;
  needsDetail: boolean;
  perSite: boolean;
}

/** Everything the expense form's dropdowns need, in one admin-only read. */
export async function loadExpenseFormOptions() {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [categories, projectRows, people] = await Promise.all([
    db
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        hint: expenseCategories.hint,
        needsPerson: expenseCategories.needsPerson,
        needsDetail: expenseCategories.needsDetail,
        perSite: expenseCategories.perSite,
      })
      .from(expenseCategories)
      .where(eq(expenseCategories.active, true))
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name)),
    db
      .select({
        id: projects.id,
        code: projects.code,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(projects)
      .innerJoin(contacts, eq(contacts.id, projects.contactId))
      .orderBy(desc(projects.code)),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.active, true))
      .orderBy(asc(user.name)),
  ]);

  return {
    categories: categories as ExpenseCategoryOption[],
    projects: projectRows.map((p) => ({
      id: p.id,
      label: `${p.code} · ${[p.firstName, p.lastName].filter(Boolean).join(" ")}`,
    })),
    people,
  };
}

export type ExpenseFormOptions = Awaited<ReturnType<typeof loadExpenseFormOptions>>;
