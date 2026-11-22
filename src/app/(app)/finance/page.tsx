import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  HandCoins,
  Landmark,
  Receipt,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { BarRow, Panel } from "@/components/dashboard/fleet";
import { ListPager } from "@/components/shell/list-controls";
import { Donut, MonthlyBars, type Series } from "@/components/finance/charts";
import { RecordPaymentDialog } from "@/components/finance/action-dialogs";
import { FinanceFilters } from "@/components/finance/finance-filters";
import {
  LOAN_STATUS_LABEL,
  PAY_STATUS_LABEL,
  PLAN_MODE_LABEL,
  compact,
  filterRows,
  inRange,
  inr,
  loadLedger,
  paginate,
  readFinanceParams,
  type LedgerRow,
  type PayStatus,
} from "@/lib/finance/ledger";
import { RECEIVED_MODE_LABELS, type ReceivedMode } from "@/lib/payments/schedule";
import { LENDER_KINDS, LENDER_KIND_LABEL } from "@/lib/finance/lender-kinds";
import { loadExpenses, spendByProject } from "@/lib/finance/expenses";
import { loadCostSheetTotals } from "@/lib/finance/cost-sheet";
import { notFound } from "next/navigation";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * The money, across every project at once — and the place to act on it.
 *
 * The per-project page answers "where is this job"; this one answers "where
 * is the business": what was quoted, what was agreed, what has come in and by
 * which road, what is still out and who is carrying it. A payment can be
 * recorded against any customer straight from the table, through the same
 * action the project's own payments page uses.
 *
 * Two kinds of filter, kept apart on purpose. The customer filters (status,
 * plan, loan, search) narrow *who* is counted. The date range narrows *when*
 * money moved — it drives the collection figures and charts, never a
 * balance, because an outstanding amount is lifetime by definition.
 */

export const metadata: Metadata = { title: "Finance" };

/** Colour follows the payment mode, never its rank. */
const MODE_SERIES: Series[] = [
  { key: "NEFT", label: "NEFT", color: "var(--data-1)" },
  { key: "LOAN_DISBURSAL_PSS1", label: "Loan — PSS1", color: "var(--data-2)" },
  { key: "CASH", label: "Cash", color: "var(--data-3)" },
  { key: "CHEQUE", label: "Cheque", color: "var(--data-4)" },
  { key: "UPI", label: "UPI", color: "var(--data-5)" },
  { key: "LOAN_DISBURSAL_PSS2", label: "Loan — PSS2", color: "var(--data-6)" },
  { key: "LOAN_DISBURSAL", label: "Loan (older)", color: "var(--data-rest)" },
];
const isLoanMode = (m: string) => m.startsWith("LOAN_DISBURSAL");

const STATUS_STYLE: Record<PayStatus, { fill: string; chip: string; Icon: typeof CircleCheck }> = {
  SETTLED: {
    fill: "var(--green)",
    chip: "bg-[var(--green-soft)] text-[var(--green-text)]",
    Icon: CircleCheck,
  },
  PARTIAL: {
    fill: "var(--gold)",
    chip: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
    Icon: CircleDot,
  },
  UNPAID: {
    fill: "var(--red-text)",
    chip: "bg-[var(--red-soft)] text-[var(--red-text)]",
    Icon: CircleDashed,
  },
  UNPRICED: {
    fill: "var(--data-rest)",
    chip: "bg-[var(--surface-2)] text-[var(--muted)]",
    Icon: CircleSlash,
  },
};

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00`));

function monthKeys(from: string, to: string) {
  const keys: string[] = [];
  const [fy, fm] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  let y = fy;
  let m = fm;
  while ((y < ty || (y === ty && m <= tm)) && keys.length < 36) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export default async function FinanceDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  // The layout closes the section too, but Next renders a page alongside its
  // layout, not after it — so the page must not reach the ledger on its own.
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canWrite = can(actor, "money.write");
  const params = readFinanceParams(await searchParams);
  const [ledger, expenseRows, sheetTotals] = await Promise.all([
    loadLedger(),
    loadExpenses(),
    loadCostSheetTotals(),
  ]);
  // A site's cost is its saved cost sheet (dealer material) plus what was
  // paid out for it (expenses). A sheet never saved contributes nothing yet.
  const siteSpend = spendByProject(expenseRows);
  for (const [projectId, total] of sheetTotals) {
    siteSpend.set(projectId, (siteSpend.get(projectId) ?? 0) + total);
  }

  // Who is counted. The status strip is drawn from everything but the status
  // filter, so clicking a segment moves between statuses rather than to zero.
  const rows = filterRows(ledger.rows, params);
  const rowsAnyStatus = filterRows(ledger.rows, { ...params, status: "" });
  const ids = new Set(rows.map((r) => r.projectId));

  // When money moved.
  const periodPayments = ledger.payments.filter(
    (p) => ids.has(p.projectId) && inRange(p.receivedOn, params) && (!params.via || p.mode === params.via),
  );
  const periodAdvances = ledger.advances.filter((a) => ids.has(a.projectId) && inRange(a.paidOn, params));
  const dated = Boolean(params.from || params.to);

  const sum = (list: LedgerRow[], pick: (r: LedgerRow) => number) => list.reduce((s, r) => s + pick(r), 0);
  const booked = sum(rows, (r) => r.value);
  const receivedAll = sum(rows, (r) => r.received);
  const givenAll = sum(rows, (r) => r.given);
  const outstanding = sum(rows, (r) => r.outstanding);
  const collectible = booked + givenAll;
  const collectedPct = collectible > 0 ? Math.round((receivedAll / collectible) * 100) : 0;

  const periodIn = periodPayments.reduce((s, p) => s + p.amount, 0);
  const periodOut = periodAdvances.reduce((s, a) => s + a.amount, 0);
  const periodCustomers = new Set(periodPayments.map((p) => p.projectId)).size;

  // Spend is business-wide: rent and salary belong to no customer, so the
  // customer filters do not narrow it. Only the date range does.
  const periodSpent = expenseRows.filter((e) => inRange(e.spentOn, params)).reduce((s, e) => s + e.amount, 0);
  const netCash = periodIn - periodSpent - periodOut;

  const quotedRows = rows.filter((r) => r.quoted > 0 && r.value > 0);
  const quotedTotal = sum(quotedRows, (r) => r.quoted);
  const agreedOfQuoted = sum(quotedRows, (r) => r.value);
  const discountTotal = quotedTotal - agreedOfQuoted;
  const belowQuote = quotedRows.filter((r) => r.discount > 0);
  const discountPct = quotedTotal > 0 ? (discountTotal / quotedTotal) * 100 : 0;
  const priced = rows.filter((r) => r.value > 0);
  const avgDeal = priced.length ? booked / priced.length : 0;

  // ── How the money arrived, in the period ──
  const byMode = new Map<string, { amount: number; count: number; customers: Set<string> }>();
  for (const p of periodPayments) {
    const t = byMode.get(p.mode) ?? { amount: 0, count: 0, customers: new Set<string>() };
    t.amount += p.amount;
    t.count += 1;
    t.customers.add(p.projectId);
    byMode.set(p.mode, t);
  }
  const directIn = [...byMode.entries()].filter(([m]) => !isLoanMode(m)).reduce((s, [, t]) => s + t.amount, 0);
  const loanIn = periodIn - directIn;
  const modeCards = MODE_SERIES.filter((s) => s.key !== "LOAN_DISBURSAL" || byMode.has(s.key)).map((s) => ({
    ...s,
    amount: byMode.get(s.key)?.amount ?? 0,
    count: byMode.get(s.key)?.count ?? 0,
    customers: byMode.get(s.key)?.customers.size ?? 0,
  }));

  // ── Monthly chart ──
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const back = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const defaultFrom = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, "0")}`;
  const earliest = periodPayments.reduce<string | null>(
    (e, p) => (!e || p.receivedOn < e ? p.receivedOn : e),
    null,
  );
  const startKey = params.from
    ? params.from.slice(0, 7)
    : earliest && earliest.slice(0, 7) < defaultFrom
      ? earliest.slice(0, 7)
      : defaultFrom;
  const endKey = params.to ? params.to.slice(0, 7) : thisMonth;
  const keys = monthKeys(startKey, endKey < startKey ? startKey : endKey);
  const months = keys.map((key) => {
    const values: Record<string, number> = {};
    let count = 0;
    for (const p of periodPayments) {
      if (p.receivedOn.slice(0, 7) !== key) continue;
      values[p.mode] = (values[p.mode] ?? 0) + p.amount;
      count += 1;
    }
    return { key, label: MONTH.format(new Date(`${key}-01T00:00:00`)), values, count };
  });
  const bestMonth = months.reduce<(typeof months)[number] | null>((best, m) => {
    const t = Object.values(m.values).reduce((s, v) => s + v, 0);
    const bt = best ? Object.values(best.values).reduce((s, v) => s + v, 0) : -1;
    return t > bt ? m : best;
  }, null);
  const bestMonthTotal = bestMonth ? Object.values(bestMonth.values).reduce((s, v) => s + v, 0) : 0;

  // ── Status strip ──
  const statusCounts = (["SETTLED", "PARTIAL", "UNPAID", "UNPRICED"] as const).map((s) => {
    const of = rowsAnyStatus.filter((r) => r.status === s);
    return { status: s, count: of.length, outstanding: sum(of, (r) => r.outstanding) };
  });
  const statusTotal = statusCounts.reduce((s, c) => s + c.count, 0);

  // ── Plan mix ──
  const byPlan = (["CASH", "FINANCE", "SPLIT"] as const).map((mode) => {
    const of = rows.filter((r) => r.mode === mode);
    return { mode, count: of.length, value: sum(of, (r) => r.value), outstanding: sum(of, (r) => r.outstanding) };
  });

  // ── Table ──
  const sorted = [...rows].sort((a, b) => {
    switch (params.sort) {
      case "RECEIVED":
        return b.received - a.received;
      case "VALUE":
        return b.value - a.value;
      case "DISCOUNT":
        return b.discount - a.discount;
      case "RECENT":
        return (b.lastPaidOn ?? "").localeCompare(a.lastPaidOn ?? "");
      case "NAME":
        return a.customer.localeCompare(b.customer);
      case "PROGRESS":
        return a.progress - b.progress;
      default:
        return b.outstanding - a.outstanding;
    }
  });
  const pageOf = paginate(sorted, params);

  // Paging is not carried into a status or sort link: a new list starts at
  // page one. Rows per page is, since it is a preference rather than a place.
  const statusHref = (status: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "status" || k === "sort" || k === "page") continue;
      if (k === "per" && v === 25) continue;
      if (v) next.set(k, String(v));
    }
    if (status) next.set("status", status);
    const s = next.toString();
    return `/finance${s ? `?${s}` : ""}`;
  };

  const periodLabel = dated
    ? `${params.from ? fmtDay(params.from) : "the start"} – ${params.to ? fmtDay(params.to) : "today"}`
    : "All time";

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Finance dashboard</h1>
          <p className="text-sm text-[var(--muted)]">
            {rows.length} of {ledger.rows.length} customers with a payment plan · money moved: {periodLabel}
          </p>
        </div>
        <span className="ref shrink-0 rounded-full bg-[var(--amber-soft)] px-3 py-1.5 text-[12px] font-bold text-[var(--amber-text)]">
          {inr(outstanding)} outstanding
        </span>
      </div>

      <FinanceFilters
        placeholder="Search customer, project code or phone"
        filters={[
          {
            name: "status",
            anyLabel: "Any payment status",
            options: [
              { value: "SETTLED", label: "Fully paid" },
              { value: "PARTIAL", label: "Partly paid" },
              { value: "UNPAID", label: "Nothing received" },
              { value: "UNPRICED", label: "No value set" },
            ],
          },
          {
            name: "plan",
            anyLabel: "Any plan",
            options: Object.entries(PLAN_MODE_LABEL).map(([value, label]) => ({ value, label })),
          },
          {
            name: "via",
            anyLabel: "Paid by any mode",
            options: MODE_SERIES.filter((s) => s.key !== "LOAN_DISBURSAL").map((s) => ({
              value: s.key,
              label: `Paid by ${s.label}`,
            })),
          },
          {
            name: "loan",
            anyLabel: "Any loan status",
            options: [
              ...Object.entries(LOAN_STATUS_LABEL).map(([value, label]) => ({ value, label })),
              { value: "NONE", label: "No loan on file" },
            ],
          },
          {
            name: "lender",
            anyLabel: "Any lender type",
            options: [
              ...LENDER_KINDS.map((k) => ({ value: k, label: LENDER_KIND_LABEL[k] })),
              { value: "UNLISTED", label: "Lender typed by hand" },
            ],
          },
        ]}
        per={pageOf.per}
      />

      {ledger.rows.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-14 text-center text-[13.5px] text-[var(--muted)]">
          No payment plan saved yet. Plans are set on each project&rsquo;s payments page.
        </p>
      ) : (
        <>
          {/* ── Hero ── */}
          <section className="mb-4 overflow-hidden rounded-[var(--radius)] bg-[var(--navy)] text-[var(--navy-ink)] shadow-[var(--shadow-panel)]">
            <div className="flex flex-wrap gap-x-10 gap-y-5 px-6 pt-6 pb-5">
              <div className="min-w-56 flex-[2_1_280px]">
                <div className="text-[12.5px] font-semibold tracking-[0.04em] uppercase opacity-70">
                  Collected · {periodLabel}
                </div>
                <div className="num mt-1.5 text-[clamp(2.25rem,6vw,3.25rem)] leading-none font-extrabold">
                  {inr(periodIn)}
                </div>
                <div className="mt-2 text-[13px] opacity-75">
                  {periodPayments.length} payment{periodPayments.length === 1 ? "" : "s"} from {periodCustomers}{" "}
                  customer{periodCustomers === 1 ? "" : "s"}
                  {periodOut > 0 ? ` · ${inr(periodOut)} given out` : ""}
                </div>
              </div>
              <dl className="grid flex-[3_1_420px] grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {[
                  ["Direct (cash, UPI, bank)", inr(directIn)],
                  ["Through loans", inr(loanIn)],
                  ["Spent (all expenses)", inr(periodSpent)],
                  ["Net cash in", `${netCash < 0 ? "−" : ""}${inr(Math.abs(netCash))}`],
                  ["Booked, lifetime", `₹${compact(booked)}`],
                  ["Received, lifetime", `₹${compact(receivedAll)}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12px] opacity-70">{k}</dt>
                    <dd className="num mt-1 text-[19px] font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="border-t border-white/10 bg-black/10 px-6 py-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                <span className="font-semibold opacity-85">Collection progress</span>
                <span className="num opacity-75">
                  {collectedPct}% of {inr(collectible)} collectible · {inr(outstanding)} to go
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-[var(--green)]"
                  style={{ width: `${Math.min(collectedPct, 100)}%` }}
                />
              </div>
            </div>
          </section>

          {/* ── KPI tiles ── */}
          <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {[
              { Icon: Receipt, label: "Quoted", value: `₹${compact(quotedTotal)}`, hint: `${quotedRows.length} with a quote` },
              { Icon: HandCoins, label: "Agreed value", value: `₹${compact(booked)}`, hint: `${priced.length} priced jobs` },
              {
                Icon: TrendingDown,
                label: "Discount on quotes",
                value: `₹${compact(Math.max(discountTotal, 0))}`,
                hint: `${discountPct.toFixed(1)}% · ${belowQuote.length} below quote`,
              },
              { Icon: Wallet, label: "Outstanding", value: `₹${compact(outstanding)}`, hint: `${rows.filter((r) => r.outstanding > 0).length} customers owe`, tone: "gold" },
              { Icon: Banknote, label: "Avg deal size", value: `₹${compact(avgDeal)}`, hint: "agreed value per job" },
              { Icon: ArrowUpRight, label: "Given to customers", value: `₹${compact(givenAll)}`, hint: "recoverable advances" },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4.5 py-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--navy-text)]">
                    <t.Icon size={15} strokeWidth={2.2} aria-hidden />
                  </span>
                  {t.label}
                </div>
                <div
                  className={`num mt-2.5 text-[24px] leading-tight font-extrabold ${
                    t.tone === "gold" ? "text-[var(--gold-text)]" : ""
                  }`}
                >
                  {t.value}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--muted)]">{t.hint}</div>
              </div>
            ))}
          </section>

          {/* ── Payment status ── */}
          <Panel title="Who has paid" note={`${statusTotal} customers · click a segment to filter`} className="mb-4">
            <div className="px-5 pt-4 pb-5">
              <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full bg-[var(--data-track)]">
                {statusCounts
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <Link
                      key={s.status}
                      href={statusHref(params.status === s.status ? "" : s.status)}
                      title={`${PAY_STATUS_LABEL[s.status]}: ${s.count}`}
                      className="block h-full"
                      style={{ width: `${(s.count / Math.max(statusTotal, 1)) * 100}%`, backgroundColor: STATUS_STYLE[s.status].fill }}
                    />
                  ))}
              </div>
              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
                {statusCounts.map((s) => {
                  const { Icon, chip } = STATUS_STYLE[s.status];
                  const on = params.status === s.status;
                  return (
                    <Link
                      key={s.status}
                      href={statusHref(on ? "" : s.status)}
                      className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-3 no-underline transition-colors ${
                        on
                          ? "border-[var(--orange)] bg-[var(--orange-soft)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${chip}`}>
                        <Icon size={16} strokeWidth={2.4} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-[var(--ink)]">{PAY_STATUS_LABEL[s.status]}</span>
                        <span className="num block text-[11.5px] text-[var(--muted)]">
                          {s.outstanding > 0 ? `₹${compact(s.outstanding)} due` : "nothing due"}
                        </span>
                      </span>
                      <span className="num text-[22px] font-extrabold text-[var(--ink)]">{s.count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* ── Mode tiles ── */}
          <section className="mb-4">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-[15px] font-bold">How the money arrived</h2>
              <p className="text-[12.5px] text-[var(--muted)]">{periodLabel} · amount, payments and customers per mode</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
              {modeCards.map((m) => (
                <div
                  key={m.key}
                  className="relative overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]"
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: m.color }} />
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)]">
                    {isLoanMode(m.key) ? <Landmark size={13} aria-hidden /> : <Banknote size={13} aria-hidden />}
                    {m.label}
                  </div>
                  <div className="num mt-1.5 text-[20px] font-extrabold">₹{compact(m.amount)}</div>
                  <div className="num mt-0.5 text-[11.5px] text-[var(--muted)]">
                    {m.count} payment{m.count === 1 ? "" : "s"} · {m.customers} customer{m.customers === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Charts ── */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Panel
              title="Collections by month"
              note={
                bestMonth && bestMonthTotal > 0
                  ? `best: ${bestMonth.label}, ${inr(bestMonthTotal)}`
                  : "no payments in this range"
              }
            >
              <div className="px-5 pt-4 pb-5">
                <MonthlyBars months={months} series={MODE_SERIES} />
              </div>
            </Panel>
            <Panel title="Share by mode" note={periodLabel}>
              <div className="px-5 py-5">
                <Donut
                  centerLabel="collected"
                  centerValue={`₹${compact(periodIn)}`}
                  slices={MODE_SERIES.filter((s) => s.key !== "LOAN_DISBURSAL" || byMode.has(s.key)).map((s) => ({
                    key: s.key,
                    label: s.label,
                    color: s.color,
                    value: byMode.get(s.key)?.amount ?? 0,
                  }))}
                />
              </div>
            </Panel>
          </div>

          {/* ── Plan mix ── */}
          <div className="mb-4">
            <Panel title="How jobs are paid for" note={`${rows.length} plans`}>
              <ul className="py-1.5">
                {byPlan.map((m, i) => (
                  <BarRow
                    key={m.mode}
                    label={`${PLAN_MODE_LABEL[m.mode]} · ${m.count} job${m.count === 1 ? "" : "s"}`}
                    share={booked > 0 ? m.value / booked : 0}
                    color={["var(--data-3)", "var(--data-1)", "var(--data-2)"][i]!}
                    primary={`₹${compact(m.value)}`}
                    secondary={m.outstanding > 0 ? `₹${compact(m.outstanding)} due` : "settled"}
                  />
                ))}
              </ul>
            </Panel>
          </div>

          {/* ── Customers ── */}
          <Panel
            title="Customers"
            note={
              <>
                {rows.length} match · balances are lifetime
              </>
            }
            className="mb-4 overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-5 py-2.5">
              <span className="text-[12px] font-semibold text-[var(--muted)]">Sort by</span>
              {(
                [
                  ["OUTSTANDING", "Outstanding"],
                  ["PROGRESS", "Least paid"],
                  ["RECENT", "Last payment"],
                  ["VALUE", "Value"],
                  ["DISCOUNT", "Discount"],
                  ["NAME", "Name"],
                ] as const
              ).map(([key, label]) => {
                const next = new URLSearchParams();
                for (const [k, v] of Object.entries(params)) {
                  if (k === "sort" || k === "page" || (k === "per" && v === 25)) continue;
                  if (v) next.set(k, String(v));
                }
                if (key !== "OUTSTANDING") next.set("sort", key);
                const s = next.toString();
                const on = params.sort === key;
                return (
                  <Link
                    key={key}
                    href={`/finance${s ? `?${s}` : ""}`}
                    scroll={false}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-semibold no-underline ${
                      on ? "bg-[var(--navy)] text-[var(--navy-ink)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">No customer matches these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                      <th className="px-5 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Plan</th>
                      <th className="px-3 py-2.5 text-right">Quoted</th>
                      <th className="px-3 py-2.5 text-right">Agreed</th>
                      <th className="px-3 py-2.5 text-right">Received</th>
                      <th className="px-3 py-2.5 text-right">Site cost</th>
                      <th className="px-3 py-2.5">Outstanding</th>
                      <th className="px-3 py-2.5">Last paid</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-5 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageOf.items.map((r) => {
                      const st = STATUS_STYLE[r.status];
                      return (
                        <tr key={r.projectId} className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--surface-2)]">
                          <td className="px-5 py-3">
                            <Link
                              href={`/projects/${r.projectId}/payments`}
                              className="ref text-[12px] font-bold text-[var(--navy-text)] no-underline hover:underline"
                            >
                              {r.code}
                            </Link>
                            <div className="max-w-56 truncate text-[13.5px] font-semibold">{r.customer || "—"}</div>
                            <div className="text-[11.5px] text-[var(--muted)]">
                              Stage {r.pipelineStage}
                              {r.phone ? ` · ${r.phone}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[12.5px]">
                            <div className="font-semibold">{PLAN_MODE_LABEL[r.mode]}</div>
                            {r.mode !== "CASH" && r.bankName ? (
                              <div className="max-w-40 truncate text-[11.5px] font-medium">{r.bankName}</div>
                            ) : null}
                            {r.loanStatus && r.mode !== "CASH" ? (
                              <div className="max-w-40 truncate text-[11.5px] text-[var(--muted)]">
                                {LOAN_STATUS_LABEL[r.loanStatus]}
                              </div>
                            ) : null}
                          </td>
                          <td className="num px-3 py-3 text-right text-[13px]">
                            {r.quoted ? inr(r.quoted) : <span className="text-[var(--muted-soft)]">—</span>}
                            {r.discount > 0 ? (
                              <div className="text-[11px] text-[var(--muted)]">−{inr(r.discount)}</div>
                            ) : null}
                          </td>
                          <td className="num px-3 py-3 text-right text-[13px] font-semibold">{r.value ? inr(r.value) : "—"}</td>
                          <td className="num px-3 py-3 text-right text-[13px]">
                            {inr(r.received)}
                            {r.given > 0 ? <div className="text-[11px] text-[var(--muted)]">+{inr(r.given)} given</div> : null}
                          </td>
                          <td className="num px-3 py-3 text-right text-[13px]">
                            {(() => {
                              const spent = siteSpend.get(r.projectId) ?? 0;
                              if (!spent) return <span className="text-[var(--muted-soft)]">—</span>;
                              const margin = r.value - spent;
                              return (
                                <Link
                                  href={`/projects/${r.projectId}/costs`}
                                  className="text-[var(--ink)] no-underline hover:underline"
                                >
                                  {inr(spent)}
                                  {r.value ? (
                                    <div className={`text-[11px] ${margin < 0 ? "text-[var(--red-text)]" : "text-[var(--muted)]"}`}>
                                      margin {margin < 0 ? "−" : ""}
                                      {inr(Math.abs(margin))}
                                    </div>
                                  ) : null}
                                </Link>
                              );
                            })()}
                          </td>
                          <td className="min-w-40 px-3 py-3">
                            <div className="num text-[13.5px] font-bold">{inr(r.outstanding)}</div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--data-track)]">
                                <span
                                  className="block h-full rounded-full"
                                  style={{ width: `${Math.round(r.progress * 100)}%`, backgroundColor: st.fill }}
                                />
                              </div>
                              <span className="num w-8 text-right text-[11px] text-[var(--muted)]">
                                {Math.round(r.progress * 100)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[12.5px] whitespace-nowrap">
                            {r.lastPaidOn ? fmtDay(r.lastPaidOn) : <span className="text-[var(--muted-soft)]">never</span>}
                            {r.paymentCount ? (
                              <div className="text-[11px] text-[var(--muted)]">
                                {r.paymentCount} payment{r.paymentCount === 1 ? "" : "s"}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${st.chip}`}>
                              <st.Icon size={12} strokeWidth={2.6} aria-hidden />
                              {PAY_STATUS_LABEL[r.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canWrite && r.status !== "SETTLED" ? (
                                <RecordPaymentDialog
                                  compact
                                  projectId={r.projectId}
                                  code={r.code}
                                  customer={r.customer}
                                  outstanding={inr(r.outstanding)}
                                  milestones={r.milestones}
                                />
                              ) : null}
                              <Link
                                href={`/projects/${r.projectId}/payments`}
                                className="inline-flex h-8 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[12px] font-bold text-[var(--navy-text)] no-underline hover:bg-[var(--surface-2)]"
                              >
                                Open
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--line)] bg-[var(--surface-2)] text-[12.5px] font-bold">
                      <td className="px-5 py-3" colSpan={2}>
                        Total · {rows.length} customers
                      </td>
                      <td className="num px-3 py-3 text-right">{inr(sum(rows, (r) => r.quoted))}</td>
                      <td className="num px-3 py-3 text-right">{inr(booked)}</td>
                      <td className="num px-3 py-3 text-right">{inr(receivedAll)}</td>
                      <td className="num px-3 py-3 text-right">{inr(sum(rows, (r) => siteSpend.get(r.projectId) ?? 0))}</td>
                      <td className="num px-3 py-3">{inr(outstanding)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="border-t border-[var(--line-soft)] px-5 pb-3.5">
              <ListPager total={rows.length} page={pageOf.page} per={pageOf.per} noun="customers" />
            </div>
          </Panel>
        </>
      )}
    </main>
  );
}
