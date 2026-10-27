import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  contacts,
  customerAdvances,
  financeApplications,
  paymentPlans,
  paymentsReceived,
  projects,
  subsidies,
} from "@/lib/db/schema";
import { BarRow, Figure, Line, Panel, seriesColor } from "@/components/dashboard/fleet";
import { RECEIVED_MODE_LABELS, type ReceivedMode } from "@/lib/payments/schedule";
import { canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * The money, across every project at once.
 *
 * The per-project page answers "where is this job"; this one answers "where
 * is the business" — what has been booked, what has come in, what is still
 * out, and which jobs are carrying it. Admin-only in full: every figure on
 * it is an amount, so the route is closed rather than having fields hidden,
 * exactly as `/projects/[id]/payments` is.
 *
 * Nothing here is editable. It is a read, and the place to act on anything
 * it shows is the project it belongs to.
 */

export const metadata: Metadata = { title: "Finance" };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** ₹3,10,000 is four characters too many in a stat tile. */
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  return Math.round(n).toLocaleString("en-IN");
};

const FINANCE_STATUS_LABEL: Record<string, string> = {
  NOT_APPLIED: "Not applied",
  APPLIED: "Applied on Jan Samarth",
  SANCTIONED: "Sanctioned, awaiting disbursal",
  DISBURSED: "Disbursed",
  REJECTED: "Rejected",
};

const MODE_LABEL: Record<string, string> = {
  CASH: "Cash",
  FINANCE: "Finance",
  SPLIT: "Split",
};

export default async function FinancePage() {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();

  const [plans, received, advances, loans, subsidyRows, commissionRows] = await Promise.all([
    db
      .select({
        projectId: paymentPlans.projectId,
        mode: paymentPlans.mode,
        totalValue: paymentPlans.totalValue,
        code: projects.code,
        pipelineStage: projects.pipelineStage,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(paymentPlans)
      .innerJoin(projects, eq(projects.id, paymentPlans.projectId))
      .innerJoin(contacts, eq(contacts.id, projects.contactId)),
    db
      .select({
        projectId: paymentsReceived.projectId,
        amount: paymentsReceived.amount,
        mode: paymentsReceived.mode,
      })
      .from(paymentsReceived),
    db
      .select({ projectId: customerAdvances.projectId, amount: customerAdvances.amount })
      .from(customerAdvances),
    db.select().from(financeApplications),
    db.select().from(subsidies),
    db.select({ amount: commissions.amount, status: commissions.status }).from(commissions),
  ]);

  const num = (v: unknown) => {
    const parsed = Number(v ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const receivedBy = new Map<string, number>();
  for (const r of received) {
    receivedBy.set(r.projectId, (receivedBy.get(r.projectId) ?? 0) + num(r.amount));
  }
  const givenBy = new Map<string, number>();
  for (const a of advances) {
    givenBy.set(a.projectId, (givenBy.get(a.projectId) ?? 0) + num(a.amount));
  }

  const booked = plans.reduce((s, p) => s + num(p.totalValue), 0);
  const collected = received.reduce((s, r) => s + num(r.amount), 0);
  const given = advances.reduce((s, a) => s + num(a.amount), 0);

  // Money handed to the customer is recoverable, so it is owed back on top of
  // the project value. A project that has overpaid does not offset one that
  // has not, which is why this is summed per project and floored there.
  const rows = plans
    .map((p) => {
      const value = num(p.totalValue);
      const got = receivedBy.get(p.projectId) ?? 0;
      const out = givenBy.get(p.projectId) ?? 0;
      return {
        ...p,
        value,
        received: got,
        given: out,
        outstanding: Math.max(value + out - got, 0),
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const chasing = rows.filter((r) => r.outstanding > 0);

  const byPayMode = (["CASH", "FINANCE", "SPLIT"] as const).map((mode) => {
    const of = rows.filter((r) => r.mode === mode);
    return {
      mode,
      count: of.length,
      value: of.reduce((s, r) => s + r.value, 0),
    };
  });

  const byReceivedMode = new Map<string, { amount: number; count: number }>();
  for (const r of received) {
    const t = byReceivedMode.get(r.mode) ?? { amount: 0, count: 0 };
    t.amount += num(r.amount);
    t.count += 1;
    byReceivedMode.set(r.mode, t);
  }
  const collectionLines = [...byReceivedMode.entries()]
    .map(([mode, t]) => ({ mode, ...t }))
    .sort((a, b) => b.amount - a.amount);

  const loanStatuses = (
    ["APPLIED", "SANCTIONED", "DISBURSED", "REJECTED", "NOT_APPLIED"] as const
  )
    .map((status) => {
      const of = loans.filter((l) => l.status === status);
      return {
        status,
        count: of.length,
        amount: of.reduce((s, l) => s + num(l.loanAmount), 0),
      };
    })
    .filter((s) => s.count > 0);

  const sanctioned = loans
    .filter((l) => l.status === "SANCTIONED" || l.status === "DISBURSED")
    .reduce((s, l) => s + num(l.loanAmount), 0);
  const awaitingDisbursal = loans
    .filter((l) => l.status === "SANCTIONED")
    .reduce((s, l) => s + num(l.loanAmount), 0);

  const subsidyExpected = subsidyRows.reduce((s, r) => s + num(r.expectedAmount), 0);
  const subsidyReceived = subsidyRows.reduce((s, r) => s + num(r.receivedAmount), 0);
  const subsidyAwaited = subsidyRows.filter((r) => r.status !== "RECEIVED").length;

  const commissionOwed = commissionRows
    .filter((c) => c.status === "ACCRUED" || c.status === "DUE")
    .reduce((s, c) => s + num(c.amount), 0);
  const commissionPaid = commissionRows
    .filter((c) => c.status === "PAID")
    .reduce((s, c) => s + num(c.amount), 0);

  const collectedPct = booked + given > 0 ? Math.round((collected / (booked + given)) * 100) : 0;

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Finance</h1>
          <p className="text-sm text-[var(--muted)]">
            Every project&rsquo;s money in one place. Admin-only, and read-only — act on a job
            from the job.
          </p>
        </div>
        <span className="ref shrink-0 rounded-full bg-[var(--amber-soft)] px-3 py-1.5 text-[12px] font-bold text-[var(--amber-text)]">
          {inr(outstanding)} outstanding
        </span>
      </div>

      {plans.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-14 text-center text-[13.5px] text-[var(--muted)]">
          No payment plan has been saved on any project yet. The first one gives this page
          something to add up.
        </p>
      ) : (
        <>
          <section className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
            {[
              { label: `Booked across ${plans.length} plans`, value: compact(booked), tone: "ink" as const },
              { label: "Collected", value: compact(collected), tone: "ink" as const },
              { label: "Given to customers", value: compact(given), tone: "ink" as const },
              { label: "Outstanding", value: compact(outstanding), tone: "gold" as const },
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-card)]"
              >
                <Figure value={`₹${tile.value}`} label={tile.label} tone={tile.tone} />
              </div>
            ))}
          </section>

          <section className="mb-4.5 rounded-[var(--radius)] bg-[var(--navy)] px-6 py-5 text-[var(--navy-ink)]">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold opacity-80">Collection</h2>
              <span className="num text-[13px] opacity-75">
                {collectedPct}% of {inr(booked + given)} collectible
              </span>
            </div>
            <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-white/15">
              <span
                className="block h-full rounded-full bg-[var(--green)]"
                style={{ width: `${Math.min(collectedPct, 100)}%` }}
              />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed opacity-70">
              Collectible is the booked value plus money handed to customers, because that comes
              back too. The subsidy is credited to the customer&rsquo;s own account, so it never
              appears here as an inflow of ours.
            </p>
          </section>

          <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4.5">
            <Panel title="How jobs are paid for" note={`${plans.length} with a plan`}>
              <ul className="py-1.5">
                {byPayMode.map((m, i) => (
                  <BarRow
                    key={m.mode}
                    label={MODE_LABEL[m.mode] ?? m.mode}
                    share={booked > 0 ? m.value / booked : 0}
                    color={seriesColor(i)}
                    primary={`₹${compact(m.value)}`}
                    secondary={`${m.count} job${m.count === 1 ? "" : "s"}`}
                  />
                ))}
              </ul>
            </Panel>

            <Panel
              title="How the money arrives"
              note={
                collectionLines.length
                  ? `${received.length} payment${received.length === 1 ? "" : "s"}`
                  : "nothing yet"
              }
            >
              {collectionLines.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--muted)]">
                  No payment has been recorded yet.
                </p>
              ) : (
                <ul className="py-1.5">
                  {collectionLines.map((m, i) => (
                    <BarRow
                      key={m.mode}
                      label={RECEIVED_MODE_LABELS[m.mode as ReceivedMode] ?? m.mode}
                      share={collected > 0 ? m.amount / collected : 0}
                      color={seriesColor(i)}
                      primary={`₹${compact(m.amount)}`}
                      secondary={`${m.count}×`}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Bank loans" note="Applied for on Jan Samarth, released as PSS1 and PSS2">
              {loanStatuses.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--muted)]">
                  No financed project has a loan recorded yet.
                </p>
              ) : (
                <div>
                  {loanStatuses.map((s) => (
                    <Line
                      key={s.status}
                      label={FINANCE_STATUS_LABEL[s.status] ?? s.status}
                      hint={`${s.count} job${s.count === 1 ? "" : "s"}`}
                      value={s.amount > 0 ? `₹${compact(s.amount)}` : "—"}
                    />
                  ))}
                  <Line label="Sanctioned in total" value={`₹${compact(sanctioned)}`} />
                  <Line label="Awaiting disbursal" value={`₹${compact(awaitingDisbursal)}`} />
                </div>
              )}
            </Panel>

            <Panel title="Subsidy and commission" note="Neither is ours to collect">
              <Line label="Subsidy expected" value={`₹${compact(subsidyExpected)}`} />
              <Line
                label="Subsidy received by customers"
                hint={subsidyAwaited ? `${subsidyAwaited} awaiting` : undefined}
                value={`₹${compact(subsidyReceived)}`}
              />
              <Line label="Commission owed to partners" value={`₹${compact(commissionOwed)}`} />
              <Line label="Commission already paid" value={`₹${compact(commissionPaid)}`} />
            </Panel>
          </div>

          <Panel
            title="Carrying the outstanding"
            note={
              chasing.length
                ? `${chasing.length} job${chasing.length === 1 ? "" : "s"}, largest first`
                : "every job is settled"
            }
          >
            {chasing.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--muted)]">
                Nothing outstanding anywhere. Every saved plan is collected in full.
              </p>
            ) : (
              <ul>
                {chasing.slice(0, 25).map((r) => (
                  <li
                    key={r.projectId}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0"
                  >
                    <Link
                      href={`/projects/${r.projectId}/payments`}
                      className="ref shrink-0 text-[12.5px] font-bold text-[var(--navy)] no-underline"
                    >
                      {r.code}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                      {[r.firstName, r.lastName].filter(Boolean).join(" ")}
                    </span>
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">
                      Stage {r.pipelineStage} · {MODE_LABEL[r.mode] ?? r.mode}
                      {r.given > 0 ? ` · ₹${compact(r.given)} advanced` : ""}
                    </span>
                    <span className="num shrink-0 text-[14px] font-bold">{inr(r.outstanding)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {chasing.length > 25 ? (
            <p className="mt-2.5 text-[12px] text-[var(--muted)]">
              The 25 largest are listed. The rest are on{" "}
              <Link href="/projects" className="font-semibold text-[var(--navy)]">
                projects
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
