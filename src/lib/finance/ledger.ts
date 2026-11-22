import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contacts,
  customerAdvances,
  financeApplications,
  lenders,
  paymentMilestones,
  paymentPlans,
  paymentsReceived,
  projects,
  quotations,
} from "@/lib/db/schema";
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from "@/lib/list/params";
import { LENDER_KINDS, type LenderKind } from "./lender-kinds";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every project with a payment plan, with its money worked out.
 *
 * The finance tabs all look at the same ledger from different sides — the
 * dashboard by customer, the loans tab by application — so the reading and
 * the arithmetic live here once. Subsidy and commission are deliberately not
 * read: neither is money the business collects. The
 * outstanding figure is computed exactly as `getMoneyView` does for one
 * project, so the two pages can never disagree about a customer.
 *
 * Asserts `money.read` itself: a caller cannot forget the boundary.
 */

export type PayStatus = "SETTLED" | "PARTIAL" | "UNPAID" | "UNPRICED";

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  SETTLED: "Fully paid",
  PARTIAL: "Partly paid",
  UNPAID: "Nothing received",
  UNPRICED: "No value set",
};

export const PLAN_MODE_LABEL: Record<string, string> = {
  CASH: "Cash",
  FINANCE: "Finance",
  SPLIT: "Split",
};

export const LOAN_STATUS_LABEL: Record<string, string> = {
  NOT_APPLIED: "Not applied",
  APPLIED: "Applied",
  SANCTIONED: "Sanctioned, awaiting disbursal",
  DISBURSED: "Disbursed",
  REJECTED: "Rejected",
};

const num = (v: unknown) => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface LedgerRow {
  projectId: string;
  code: string;
  customer: string;
  phone: string | null;
  pipelineStage: number;
  mode: "CASH" | "FINANCE" | "SPLIT";
  /** Agreed project value. */
  value: number;
  /** What was quoted — the plan's own figure, else the chosen quotation's. */
  quoted: number;
  /** Quoted minus agreed, when both are known. Positive is a discount. */
  discount: number;
  received: number;
  given: number;
  outstanding: number;
  /** 0–1 of value + given. */
  progress: number;
  status: PayStatus;
  paymentCount: number;
  lastPaidOn: string | null;
  /** Every received mode this customer has paid through. */
  modes: string[];
  loanStatus: string | null;
  loanAmount: number;
  bankName: string | null;
  lenderId: number | null;
  /** Null when the lender was typed by hand rather than picked. */
  lenderKind: LenderKind | null;
  milestones: Array<{ id: number; label: string }>;
}

export interface LedgerPayment {
  id: string;
  projectId: string;
  code: string;
  customer: string;
  amount: number;
  mode: string;
  receivedOn: string;
  referenceNo: string | null;
}

export interface LedgerAdvance {
  id: string;
  projectId: string;
  code: string;
  customer: string;
  amount: number;
  mode: string;
  paidOn: string;
  referenceNo: string | null;
  note: string | null;
}

export async function loadLedger() {
  const actor = await getActor();
  assertCan(actor, "money.read");

  const [plans, received, advances, loans, milestoneRows, chosen] =
    await Promise.all([
      db
        .select({
          projectId: paymentPlans.projectId,
          mode: paymentPlans.mode,
          totalValue: paymentPlans.totalValue,
          quotationAmount: paymentPlans.quotationAmount,
          code: projects.code,
          pipelineStage: projects.pipelineStage,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
        })
        .from(paymentPlans)
        .innerJoin(projects, eq(projects.id, paymentPlans.projectId))
        .innerJoin(contacts, eq(contacts.id, projects.contactId)),
      db
        .select({
          id: paymentsReceived.id,
          projectId: paymentsReceived.projectId,
          amount: paymentsReceived.amount,
          mode: paymentsReceived.mode,
          receivedOn: paymentsReceived.receivedOn,
          referenceNo: paymentsReceived.referenceNo,
        })
        .from(paymentsReceived),
      db.select().from(customerAdvances),
      db
        .select({
          projectId: financeApplications.projectId,
          status: financeApplications.status,
          loanAmount: financeApplications.loanAmount,
          bankName: financeApplications.bankName,
          lenderId: financeApplications.lenderId,
          lenderKind: lenders.kind,
        })
        .from(financeApplications)
        .leftJoin(lenders, eq(lenders.id, financeApplications.lenderId)),
      db.select().from(paymentMilestones).orderBy(paymentMilestones.sortOrder),
      db
        .select({ projectId: quotations.projectId, totalAmount: quotations.totalAmount })
        .from(quotations)
        .where(and(eq(quotations.isChosen, true), isNull(quotations.deletedAt))),
    ]);

  const nameOf = new Map<string, { code: string; customer: string }>();
  for (const p of plans) {
    nameOf.set(p.projectId, {
      code: p.code,
      customer: [p.firstName, p.lastName].filter(Boolean).join(" "),
    });
  }

  const chosenBy = new Map<string, number>();
  for (const q of chosen) if (q.projectId) chosenBy.set(q.projectId, num(q.totalAmount));

  const loanBy = new Map(loans.map((l) => [l.projectId, l]));

  const receivedBy = new Map<string, typeof received>();
  for (const r of received) {
    const list = receivedBy.get(r.projectId) ?? [];
    list.push(r);
    receivedBy.set(r.projectId, list);
  }
  const givenBy = new Map<string, number>();
  for (const a of advances) givenBy.set(a.projectId, (givenBy.get(a.projectId) ?? 0) + num(a.amount));

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const milestonesBy = new Map<string, Array<{ id: number; label: string }>>();
  for (const m of milestoneRows) {
    const list = milestonesBy.get(m.projectId) ?? [];
    list.push({ id: m.id, label: `${m.trigger.replace(/_/g, " ").toLowerCase()} · ${inr(num(m.amount))}` });
    milestonesBy.set(m.projectId, list);
  }

  const rows: LedgerRow[] = plans.map((p) => {
    const value = num(p.totalValue);
    const quoted = num(p.quotationAmount) || chosenBy.get(p.projectId) || 0;
    const payments = receivedBy.get(p.projectId) ?? [];
    const got = payments.reduce((s, r) => s + num(r.amount), 0);
    const out = givenBy.get(p.projectId) ?? 0;
    const collectible = value + out;
    const outstanding = Math.max(collectible - got, 0);
    const status: PayStatus =
      value <= 0 ? "UNPRICED" : outstanding <= 0 ? "SETTLED" : got > 0 ? "PARTIAL" : "UNPAID";
    const loan = loanBy.get(p.projectId);
    const lastPaidOn = payments.reduce<string | null>(
      (latest, r) => (!latest || r.receivedOn > latest ? r.receivedOn : latest),
      null,
    );

    return {
      projectId: p.projectId,
      code: p.code,
      customer: nameOf.get(p.projectId)?.customer ?? "",
      phone: p.phone ?? null,
      pipelineStage: p.pipelineStage,
      mode: p.mode,
      value,
      quoted,
      discount: quoted > 0 && value > 0 ? quoted - value : 0,
      received: got,
      given: out,
      outstanding,
      progress: collectible > 0 ? Math.min(got / collectible, 1) : 0,
      status,
      paymentCount: payments.length,
      lastPaidOn,
      modes: [...new Set(payments.map((r) => r.mode))],
      loanStatus: loan?.status ?? null,
      loanAmount: num(loan?.loanAmount),
      bankName: loan?.bankName ?? null,
      lenderId: loan?.lenderId ?? null,
      lenderKind: loan?.lenderKind ?? null,
      milestones: milestonesBy.get(p.projectId) ?? [],
    };
  });

  const payments: LedgerPayment[] = received.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    code: nameOf.get(r.projectId)?.code ?? "—",
    customer: nameOf.get(r.projectId)?.customer ?? "Project without a plan",
    amount: num(r.amount),
    mode: r.mode,
    receivedOn: r.receivedOn,
    referenceNo: r.referenceNo,
  }));

  const given: LedgerAdvance[] = advances.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    code: nameOf.get(a.projectId)?.code ?? "—",
    customer: nameOf.get(a.projectId)?.customer ?? "Project without a plan",
    amount: num(a.amount),
    mode: a.mode,
    paidOn: a.paidOn,
    referenceNo: a.referenceNo,
    note: a.note,
  }));

  return {
    rows,
    payments,
    advances: given,
    loans,
  };
}

export type Ledger = Awaited<ReturnType<typeof loadLedger>>;

/** ₹3,10,000 is four characters too many in a stat tile. */
export function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  return Math.round(n).toLocaleString("en-IN");
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// ── Query string ──────────────────────────────────────────────────────────

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string) {
  const value = raw[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The filters every finance tab shares, read from a URL anyone can type. */
export function readFinanceParams(raw: Raw) {
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | "" => {
    const v = one(raw, key).toUpperCase() as T;
    return allowed.includes(v) ? v : "";
  };
  const from = one(raw, "from");
  const to = one(raw, "to");
  return {
    q: one(raw, "q").slice(0, 80).toLowerCase(),
    status: pick("status", ["SETTLED", "PARTIAL", "UNPAID", "UNPRICED"] as const),
    plan: pick("plan", ["CASH", "FINANCE", "SPLIT"] as const),
    loan: pick("loan", ["NOT_APPLIED", "APPLIED", "SANCTIONED", "DISBURSED", "REJECTED", "NONE"] as const),
    lender: pick("lender", [...LENDER_KINDS, "UNLISTED"] as const),
    via: pick("via", [
      "NEFT",
      "UPI",
      "CASH",
      "CHEQUE",
      "LOAN_DISBURSAL_PSS1",
      "LOAN_DISBURSAL_PSS2",
      "LOAN_DISBURSAL",
    ] as const),
    from: ISO.test(from) ? from : "",
    to: ISO.test(to) ? to : "",
    sort: pick("sort", ["OUTSTANDING", "RECEIVED", "VALUE", "DISCOUNT", "RECENT", "NAME", "PROGRESS"] as const) || "OUTSTANDING",
    ...readPaging(raw),
  };
}

/** Page and rows-per-page, as the quotation and agreement lists read them. */
export function readPaging(raw: Raw) {
  const perRaw = Number(one(raw, "per"));
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw) ? perRaw : DEFAULT_PER_PAGE;
  const pageRaw = Number(one(raw, "page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  return { page, per };
}

/**
 * One page of a list. A page past the end — the filter narrowed under you —
 * falls back to the last real page rather than showing an empty table.
 */
export function paginate<T>(list: T[], paging: { page: number; per: number }) {
  const pages = Math.max(1, Math.ceil(list.length / paging.per));
  const page = Math.min(paging.page, pages);
  return { items: list.slice((page - 1) * paging.per, page * paging.per), page, per: paging.per };
}

export type FinanceParams = ReturnType<typeof readFinanceParams>;

/** Customer-level filters. Dates are not one: a balance is lifetime. */
export function filterRows(rows: LedgerRow[], p: FinanceParams) {
  return rows.filter((r) => {
    if (p.q && !`${r.code} ${r.customer} ${r.phone ?? ""}`.toLowerCase().includes(p.q)) return false;
    if (p.status && r.status !== p.status) return false;
    if (p.plan && r.mode !== p.plan) return false;
    if (p.loan === "NONE" ? r.loanStatus !== null : p.loan && r.loanStatus !== p.loan) return false;
    if (p.via && !r.modes.includes(p.via)) return false;
    if (p.lender && !matchesLender(r, p.lender)) return false;
    return true;
  });
}

/** "UNLISTED" is a lender typed by hand — the ones an admin should add. */
export function matchesLender(r: LedgerRow, lender: LenderKind | "UNLISTED") {
  return lender === "UNLISTED" ? Boolean(r.bankName) && !r.lenderKind : r.lenderKind === lender;
}

export function inRange(date: string, p: Pick<FinanceParams, "from" | "to">) {
  return (!p.from || date >= p.from) && (!p.to || date <= p.to);
}
