"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  auditLog,
  customerAdvances,
  financeApplications,
  paymentMilestones,
  paymentPlans,
  paymentsReceived,
  projects,
  subsidies,
} from "@/lib/db/schema";
import {
  isScheduleTrigger,
  type PaidOutMode,
  type ReceivedMode,
  type ScheduleTrigger,
} from "@/lib/payments/schedule";
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

/**
 * One line of the schedule: when it falls due, and how much.
 *
 * There is no label. The trigger says what the money is for, and a free-text
 * name alongside it was only ever a second answer to the same question.
 */
export interface MilestoneInput {
  amount: string;
  trigger: ScheduleTrigger;
  dueDate?: string;
}

const money = (v: string) => {
  const n = Number(String(v).replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

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
      error: `Cash and finance add up to ${inr(cash + finance)}, not ${inr(total)}.`,
    };
  }

  const parsed: Array<{ amount: number; trigger: ScheduleTrigger; dueDate?: string }> = [];
  for (const m of input.milestones) {
    // A blank line is someone who added a row and changed their mind, not an
    // error: the schedule is optional, so an empty one is simply dropped.
    if (!String(m.amount).trim()) continue;
    if (!isScheduleTrigger(m.trigger)) {
      return { ok: false, error: "Pick a trigger for every scheduled line." };
    }
    const amount = money(m.amount);
    if (amount === null || amount <= 0) {
      return { ok: false, error: "Every scheduled line needs an amount above zero." };
    }
    parsed.push({ amount, trigger: m.trigger, ...(m.dueDate ? { dueDate: m.dueDate } : {}) });
  }

  // The schedule may fall short of the total — a plan that bills the balance
  // once the subsidy lands is left open on purpose, and a bank's split of its
  // own tranches is not ours to make add up. It may never exceed the total;
  // that is a typo, and it would quote a customer more than was agreed.
  const scheduled = parsed.reduce((s, m) => s + m.amount, 0);
  if (scheduled - total > 1) {
    return {
      ok: false,
      error: `The schedule comes to ${inr(scheduled)}, more than the project value of ${inr(total)}.`,
    };
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

    // A payment already recorded against a line must not keep a foreign key
    // to a row that is about to go. The schedule is retyped freely now that
    // saving is the whole act, so this happens often.
    await tx
      .update(paymentsReceived)
      .set({ milestoneId: null })
      .where(eq(paymentsReceived.projectId, projectId));
    await tx.delete(paymentMilestones).where(eq(paymentMilestones.projectId, projectId));
    if (parsed.length) {
      await tx.insert(paymentMilestones).values(
        parsed.map((m, i) => ({
          projectId,
          amount: String(m.amount),
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
      after: { ...set, scheduledLines: parsed.length },
    });
  });

  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/finance");
  return { ok: true };
}

export async function recordPayment(
  projectId: string,
  input: {
    amount: string;
    mode: ReceivedMode;
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
  revalidatePath("/finance");
  return { ok: true };
}

/**
 * Money handed to the customer.
 *
 * Neither a discount nor an expense — it comes back, so it is added to what
 * the project owes and is cleared by an ordinary payment received. Recording
 * it here is the only thing that keeps the outstanding figure true.
 */
export async function recordCustomerAdvance(
  projectId: string,
  input: {
    amount: string;
    mode: PaidOutMode;
    paidOn: string;
    referenceNo?: string;
    note?: string;
  },
): Promise<MoneyResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const amount = money(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Enter the amount given." };
  if (!input.paidOn) return { ok: false, error: "Enter the date it was given." };

  await db.insert(customerAdvances).values({
    id: newId("adv"),
    projectId,
    amount: String(amount),
    mode: input.mode,
    paidOn: input.paidOn,
    referenceNo: input.referenceNo?.trim() || null,
    note: input.note?.trim() || null,
    recordedBy: actor.id,
  });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "payment.advance.given",
    entityType: "customer_advance",
    entityId: projectId,
    projectId,
    after: { amount, mode: input.mode, paidOn: input.paidOn, note: input.note?.trim() || null },
  });

  revalidatePath(`/projects/${projectId}/payments`);
  revalidatePath("/finance");
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
  revalidatePath("/finance");
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
  revalidatePath("/finance");
  return { ok: true };
}

/** Everything the payments page needs, in one admin-only read. */
export async function getMoneyView(projectId: string) {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const [plan] = await db
    .select()
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);
  const milestones = await db
    .select()
    .from(paymentMilestones)
    .where(eq(paymentMilestones.projectId, projectId))
    .orderBy(paymentMilestones.sortOrder);
  const received = await db
    .select()
    .from(paymentsReceived)
    .where(eq(paymentsReceived.projectId, projectId));
  const advances = await db
    .select()
    .from(customerAdvances)
    .where(eq(customerAdvances.projectId, projectId))
    .orderBy(customerAdvances.paidOn);
  const [finance] = await db
    .select()
    .from(financeApplications)
    .where(eq(financeApplications.projectId, projectId))
    .limit(1);
  const [subsidy] = await db
    .select()
    .from(subsidies)
    .where(eq(subsidies.projectId, projectId))
    .limit(1);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  const totalReceived = received.reduce((s, r) => s + Number(r.amount), 0);
  const totalGiven = advances.reduce((s, a) => s + Number(a.amount), 0);
  const totalValue = plan?.totalValue ? Number(plan.totalValue) : 0;

  return {
    project: project ?? null,
    plan: plan ?? null,
    milestones,
    received,
    advances,
    finance: finance ?? null,
    subsidy: subsidy ?? null,
    totalReceived,
    totalGiven,
    // Money handed to the customer is recoverable, so the project owes it
    // back on top of its value.
    outstanding: Math.max(totalValue + totalGiven - totalReceived, 0),
  };
}
