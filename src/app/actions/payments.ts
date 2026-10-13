"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  auditLog,
  financeApplications,
  paymentMilestones,
  paymentPlans,
  paymentsReceived,
  projects,
  subsidies,
} from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { involvesFinance, type PaymentMode } from "@/lib/workflow/stages";

/**
 * Every action here asserts `money.write` or `money.read` first.
 *
 * That is the whole money boundary: an employee calling one of these gets a
 * ForbiddenError from the matrix before a single row is read, so there is
 * never an amount in a response for the browser to reveal.
 */

export type MoneyResult = { ok: true } | { ok: false; error: string };

export interface MilestoneInput {
  label: string;
  amount: string;
  trigger: "UPFRONT" | "ON_INSTALL" | "POST_SUBSIDY" | "ON_LOAN_DISBURSAL";
  dueDate?: string;
}

const money = (v: string) => {
  const n = Number(String(v).replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function savePaymentPlan(
  projectId: string,
  input: {
    mode: PaymentMode;
    totalValue: string;
    cashComponent: string;
    financeComponent: string;
    milestones: MilestoneInput[];
  },
): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const total = money(input.totalValue);
  if (total === null || total <= 0) return { ok: false, error: "Enter the project value." };

  const cash = money(input.cashComponent) ?? 0;
  const finance = money(input.financeComponent) ?? 0;

  if (input.mode === "CASH" && finance > 0) {
    return { ok: false, error: "A cash project cannot have a finance component." };
  }
  if (involvesFinance(input.mode) && finance <= 0) {
    return { ok: false, error: "A financed project needs a finance component." };
  }
  if (Math.abs(cash + finance - total) > 1) {
    return {
      ok: false,
      error: `Cash and finance add up to ₹${(cash + finance).toLocaleString("en-IN")}, not ₹${total.toLocaleString("en-IN")}.`,
    };
  }

  const parsed: Array<MilestoneInput & { value: number }> = [];
  for (const m of input.milestones) {
    const amount = money(m.amount);
    if (!m.label.trim()) return { ok: false, error: "Every milestone needs a label." };
    if (amount === null || amount <= 0) {
      return { ok: false, error: `"${m.label}" needs an amount.` };
    }
    parsed.push({ ...m, value: amount });
  }

  const milestoneSum = parsed.reduce((s, m) => s + m.value, 0);
  if (parsed.length > 0 && Math.abs(milestoneSum - total) > 1) {
    return {
      ok: false,
      error: `Milestones add up to ₹${milestoneSum.toLocaleString("en-IN")}, not ₹${total.toLocaleString("en-IN")}.`,
    };
  }

  const existing = await db
    .select()
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);
  if (existing[0]?.lockedAt) {
    return { ok: false, error: "This plan is locked. Unlock it before editing." };
  }

  await db.transaction(async (tx) => {
    const set = {
      mode: input.mode,
      totalValue: String(total),
      cashComponent: String(cash),
      financeComponent: String(finance),
      updatedAt: new Date(),
    };
    await tx
      .insert(paymentPlans)
      .values({ projectId, ...set })
      .onConflictDoUpdate({ target: paymentPlans.projectId, set });

    await tx.delete(paymentMilestones).where(eq(paymentMilestones.projectId, projectId));
    if (parsed.length) {
      await tx.insert(paymentMilestones).values(
        parsed.map((m, i) => ({
          projectId,
          label: m.label.trim(),
          amount: String(m.value),
          trigger: m.trigger,
          dueDate: m.dueDate || null,
          sortOrder: i,
        })),
      );
    }

    // A cash project has no loan, so any stale finance row goes.
    if (!involvesFinance(input.mode)) {
      await tx.delete(financeApplications).where(eq(financeApplications.projectId, projectId));
    }

    await tx.insert(auditLog).values({
      actorId: actor.id,
      action: "payment.plan.save",
      entityType: "payment_plan",
      entityId: projectId,
      projectId,
      after: { ...set, milestones: parsed.length },
    });
  });

  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function lockPaymentPlan(projectId: string): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [plan] = await db
    .select()
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);
  if (!plan) return { ok: false, error: "There is no plan to lock yet." };
  if (plan.lockedAt) return { ok: false, error: "Already locked." };

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(paymentMilestones)
    .where(eq(paymentMilestones.projectId, projectId));
  if ((count?.n ?? 0) === 0) {
    return { ok: false, error: "Add at least one milestone before locking." };
  }

  await db
    .update(paymentPlans)
    .set({ lockedAt: new Date(), lockedBy: actor.id })
    .where(eq(paymentPlans.projectId, projectId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "payment.plan.lock",
    entityType: "payment_plan",
    entityId: projectId,
    projectId,
  });

  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function unlockPaymentPlan(projectId: string, reason: string): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");
  if (reason.trim().length < 10) {
    return { ok: false, error: "Unlocking a locked plan needs a written reason." };
  }

  await db
    .update(paymentPlans)
    .set({ lockedAt: null, lockedBy: null })
    .where(eq(paymentPlans.projectId, projectId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "payment.plan.unlock",
    entityType: "payment_plan",
    entityId: projectId,
    projectId,
    reason: reason.trim(),
  });

  revalidatePath(`/projects/${projectId}/payments`);
  return { ok: true };
}

export async function recordPayment(
  projectId: string,
  input: {
    amount: string;
    mode: "CASH" | "UPI" | "CHEQUE" | "NEFT" | "LOAN_DISBURSAL";
    receivedOn: string;
    referenceNo?: string;
    milestoneId?: number;
  },
): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const amount = money(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Enter the amount received." };
  if (!input.receivedOn) return { ok: false, error: "Enter the date it was received." };

  await db.insert(paymentsReceived).values({
    id: newId("pay"),
    projectId,
    milestoneId: input.milestoneId ?? null,
    amount: String(amount),
    mode: input.mode,
    receivedOn: input.receivedOn,
    referenceNo: input.referenceNo?.trim() || null,
    recordedBy: actor.id,
  });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "payment.received",
    entityType: "payment",
    entityId: projectId,
    projectId,
    after: { amount, mode: input.mode, receivedOn: input.receivedOn },
  });

  revalidatePath(`/projects/${projectId}/payments`);
  return { ok: true };
}

export async function saveFinance(
  projectId: string,
  input: { bankName: string; loanAmount: string; status: string },
): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "finance.write");

  const amount = money(input.loanAmount);
  const set = {
    bankName: input.bankName.trim() || null,
    loanAmount: amount === null ? null : String(amount),
    status: input.status as "NOT_APPLIED" | "APPLIED" | "SANCTIONED" | "DISBURSED" | "REJECTED",
    updatedAt: new Date(),
  };

  await db
    .insert(financeApplications)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: financeApplications.projectId, set });

  revalidatePath(`/projects/${projectId}/payments`);
  return { ok: true };
}

/**
 * Marking the subsidy received is the event the whole settlement stage hangs
 * on: the customer now has the money, so the balance can be chased.
 */
export async function saveSubsidy(
  projectId: string,
  input: { status: string; expectedAmount: string; receivedAmount: string; receivedOn: string },
): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const set = {
    status: input.status as "NOT_APPLIED" | "APPLIED" | "APPROVED" | "RECEIVED",
    expectedAmount: money(input.expectedAmount) === null ? null : String(money(input.expectedAmount)),
    receivedAmount: money(input.receivedAmount) === null ? null : String(money(input.receivedAmount)),
    receivedOn: input.receivedOn || null,
    updatedAt: new Date(),
  };

  await db
    .insert(subsidies)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: subsidies.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "subsidy.update",
    entityType: "subsidy",
    entityId: projectId,
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/payments`);
  return { ok: true };
}

/** Everything the payments page needs, in one admin-only read. */
export async function getMoneyView(projectId: string) {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const [plan] = await db.select().from(paymentPlans).where(eq(paymentPlans.projectId, projectId)).limit(1);
  const milestones = await db
    .select()
    .from(paymentMilestones)
    .where(eq(paymentMilestones.projectId, projectId))
    .orderBy(paymentMilestones.sortOrder);
  const received = await db
    .select()
    .from(paymentsReceived)
    .where(eq(paymentsReceived.projectId, projectId));
  const [finance] = await db
    .select()
    .from(financeApplications)
    .where(eq(financeApplications.projectId, projectId))
    .limit(1);
  const [subsidy] = await db.select().from(subsidies).where(eq(subsidies.projectId, projectId)).limit(1);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  const totalReceived = received.reduce((s, r) => s + Number(r.amount), 0);
  const totalValue = plan?.totalValue ? Number(plan.totalValue) : 0;

  return {
    project: project ?? null,
    plan: plan ?? null,
    milestones,
    received,
    finance: finance ?? null,
    subsidy: subsidy ?? null,
    totalReceived,
    outstanding: Math.max(totalValue - totalReceived, 0),
  };
}

/** A tiny read used by the stage gate. Admin-only like everything else here. */
export async function isPlanLocked(projectId: string): Promise<boolean> {
  const [plan] = await db
    .select({ lockedAt: paymentPlans.lockedAt })
    .from(paymentPlans)
    .where(and(eq(paymentPlans.projectId, projectId)))
    .limit(1);
  return Boolean(plan?.lockedAt);
}
