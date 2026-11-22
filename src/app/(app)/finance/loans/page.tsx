import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/dashboard/fleet";
import { LoanDialog, RecordPaymentDialog } from "@/components/finance/action-dialogs";
import { FinanceFilters } from "@/components/finance/finance-filters";
import { ListPager } from "@/components/shell/list-controls";
import {
  LOAN_STATUS_LABEL,
  PLAN_MODE_LABEL,
  compact,
  inr,
  loadLedger,
  matchesLender,
  paginate,
  readPaging,
} from "@/lib/finance/ledger";
import {
  LENDER_KINDS,
  LENDER_KIND_LABEL,
  LENDER_KIND_SHORT,
  isLenderKind,
  type LenderKind,
} from "@/lib/finance/lender-kinds";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Financed jobs, by where their loan has got to.
 *
 * The loan status can be moved on from here — the same form as the project
 * page — and a PSS tranche recorded as a payment the moment the bank
 * releases it.
 */

export const metadata: Metadata = { title: "Loans" };

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => ((Array.isArray(raw[k]) ? raw[k]![0] : raw[k]) as string | undefined)?.trim() ?? "";

const STAGES = ["NOT_APPLIED", "APPLIED", "SANCTIONED", "DISBURSED", "REJECTED"] as const;
const STAGE_TONE: Record<string, string> = {
  NOT_APPLIED: "bg-[var(--surface-2)] text-[var(--muted)]",
  APPLIED: "bg-[var(--navy-soft)] text-[var(--navy-text)]",
  SANCTIONED: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  DISBURSED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  REJECTED: "bg-[var(--red-soft)] text-[var(--red-text)]",
};

export default async function LoansPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canWrite = can(actor, "money.write");
  const canLoan = can(actor, "finance.write");

  const raw = await searchParams;
  const q = one(raw, "q").slice(0, 80).toLowerCase();
  const loan = (STAGES as readonly string[]).includes(one(raw, "loan")) ? one(raw, "loan") : "";
  const lenderRaw = one(raw, "lender");
  const lender = isLenderKind(lenderRaw) || lenderRaw === "UNLISTED" ? lenderRaw : "";
  const paging = readPaging(raw);

  const ledger = await loadLedger();

  const financed = ledger.rows.filter((r) => r.mode !== "CASH");
  const rows = financed
    .filter((r) => {
      if (loan && (r.loanStatus ?? "NOT_APPLIED") !== loan) return false;
      if (lender && !matchesLender(r, lender)) return false;
      if (q && !`${r.code} ${r.customer} ${r.bankName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        STAGES.indexOf((a.loanStatus ?? "NOT_APPLIED") as (typeof STAGES)[number]) -
          STAGES.indexOf((b.loanStatus ?? "NOT_APPLIED") as (typeof STAGES)[number]) ||
        b.outstanding - a.outstanding,
    );
  const pageOf = paginate(rows, paging);

  const stageTotals = STAGES.map((s) => {
    const of = financed.filter((r) => (r.loanStatus ?? "NOT_APPLIED") === s);
    return { status: s, count: of.length, amount: of.reduce((t, r) => t + r.loanAmount, 0) };
  });

  // Lenders in use, grouped by type; a typed-in name sits under "Not in list".
  const byLender = new Map<string, { kind: LenderKind | null; count: number; amount: number }>();
  for (const r of financed) {
    if (!r.bankName) continue;
    const t = byLender.get(r.bankName) ?? { kind: r.lenderKind, count: 0, amount: 0 };
    t.count += 1;
    t.amount += r.loanAmount;
    byLender.set(r.bankName, t);
  }
  const lenderGroups = [...LENDER_KINDS, null].map((kind) => ({
    kind,
    label: kind ? LENDER_KIND_LABEL[kind] : "Not in the lender list",
    items: [...byLender.entries()]
      .filter(([, t]) => t.kind === kind)
      .sort((a, b) => b[1].amount - a[1].amount),
  })).filter((g) => g.items.length);
  const lenderCount = byLender.size;

  const loanHref = (status: string) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (paging.per !== 25) next.set("per", String(paging.per));
    if (lender) next.set("lender", lender);
    if (status) next.set("loan", status);
    const s = next.toString();
    return `/finance/loans${s ? `?${s}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-14 sm:px-6">
      <div className="mb-4">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Loans</h1>
        <p className="text-sm text-[var(--muted)]">
          {financed.length} financed or split jobs · banks through Jan Samarth, third-party lenders directly.
        </p>
      </div>

      <FinanceFilters
        placeholder="Search customer, code or bank"
        showDates={false}
        per={pageOf.per}
        filters={[
          {
            name: "loan",
            anyLabel: "Any loan status",
            options: STAGES.map((s) => ({ value: s, label: LOAN_STATUS_LABEL[s]! })),
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
      />

      <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        {stageTotals.map((s) => {
          const on = loan === s.status;
          return (
            <Link
              key={s.status}
              href={loanHref(on ? "" : s.status)}
              className={`rounded-[var(--radius)] border px-4.5 py-4 no-underline shadow-[var(--shadow-card)] ${
                on ? "border-[var(--orange)] bg-[var(--orange-soft)]" : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[s.status]}`}>
                {LOAN_STATUS_LABEL[s.status]}
              </span>
              <div className="num mt-2 text-[26px] leading-tight font-extrabold text-[var(--ink)]">{s.count}</div>
              <div className="num text-[12px] text-[var(--muted)]">₹{compact(s.amount)} in loans</div>
            </Link>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <Panel title="Financed jobs" note={`${rows.length} match`} className="overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">Nothing matches these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                    <th className="px-5 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Loan</th>
                    <th className="px-3 py-2.5 text-right">Loan amount</th>
                    <th className="px-3 py-2.5 text-right">Outstanding</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageOf.items.map((r) => {
                    const status = r.loanStatus ?? "NOT_APPLIED";
                    return (
                      <tr key={r.projectId} className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--surface-2)]">
                        <td className="px-5 py-3">
                          <Link href={`/projects/${r.projectId}/payments`} className="ref text-[12px] font-bold text-[var(--navy-text)] no-underline hover:underline">
                            {r.code}
                          </Link>
                          <div className="max-w-52 truncate text-[13.5px] font-semibold">{r.customer}</div>
                          <div className="text-[11.5px] text-[var(--muted)]">{PLAN_MODE_LABEL[r.mode]}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${STAGE_TONE[status]}`}>
                            {LOAN_STATUS_LABEL[status]}
                          </span>
                          <div className="mt-1 max-w-48 truncate text-[12.5px] font-semibold">{r.bankName ?? "No lender yet"}</div>
                          {r.bankName ? (
                            <div className="text-[11px] text-[var(--muted)]">
                              {r.lenderKind ? LENDER_KIND_SHORT[r.lenderKind] : "Not in the lender list"}
                            </div>
                          ) : null}
                        </td>
                        <td className="num px-3 py-3 text-right text-[13px] font-semibold">{r.loanAmount ? inr(r.loanAmount) : "—"}</td>
                        <td className="num px-3 py-3 text-right text-[13.5px] font-bold">{inr(r.outstanding)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canLoan ? (
                              <LoanDialog
                                projectId={r.projectId}
                                code={r.code}
                                customer={r.customer}
                                lenderLabel={
                                  r.bankName
                                    ? `${r.bankName}${r.lenderKind ? ` · ${LENDER_KIND_LABEL[r.lenderKind]}` : ""}`
                                    : null
                                }
                                initial={{
                                  loanAmount: r.loanAmount ? String(r.loanAmount) : "",
                                  status,
                                }}
                              />
                            ) : null}
                            {canWrite && r.outstanding > 0 ? (
                              <RecordPaymentDialog
                                compact
                                projectId={r.projectId}
                                code={r.code}
                                customer={r.customer}
                                outstanding={inr(r.outstanding)}
                                milestones={r.milestones}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-[var(--line-soft)] px-5 pb-3.5">
            <ListPager total={rows.length} page={pageOf.page} per={pageOf.per} noun="jobs" />
          </div>
        </Panel>

        <Panel title="By lender" note={`${lenderCount} in use`}>
          {lenderGroups.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[var(--muted)]">No lender recorded yet.</p>
          ) : (
            lenderGroups.map((g) => (
              <div key={g.kind ?? "unlisted"}>
                <h3 className="border-b border-[var(--line-soft)] bg-[var(--surface-2)] px-5 py-2 text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  {g.label}
                </h3>
                <ul>
                  {g.items.map(([name, t]) => (
                    <li key={name} className="flex items-baseline gap-3 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{name}</span>
                      <span className="num text-[12px] text-[var(--muted)]">{t.count}×</span>
                      <span className="num text-[13.5px] font-bold">₹{compact(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Panel>
      </div>
    </main>
  );
}
