import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, HardHat, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Panel } from "@/components/dashboard/fleet";
import { MonthlyBars, type Series } from "@/components/finance/charts";
import { AddExpenseDialog, DeleteExpenseButton } from "@/components/finance/expense-form";
import { FinanceFilters } from "@/components/finance/finance-filters";
import { ListPager } from "@/components/shell/list-controls";
import { loadExpenseFormOptions, loadExpenses } from "@/lib/finance/expenses";
import { compact, inRange, inr, loadLedger, paginate, readPaging } from "@/lib/finance/ledger";
import { PAID_OUT_MODES, RECEIVED_MODE_LABELS, type ReceivedMode } from "@/lib/payments/schedule";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Where the money goes.
 *
 * Every expense, filterable by what it was for, which site, how it was paid
 * and when — with the split that matters most to a small installer: money
 * spent on sites (which a project's value has to cover) against money spent
 * running the business.
 */

export const metadata: Metadata = { title: "Expenses" };

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => ((Array.isArray(raw[k]) ? raw[k]![0] : raw[k]) as string | undefined)?.trim() ?? "";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const SERIES: Series[] = [
  { key: "site", label: "On sites", color: "var(--data-1)" },
  { key: "office", label: "Office & overhead", color: "var(--data-2)" },
];

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00`));

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canWrite = can(actor, "money.write");

  const raw = await searchParams;
  const q = one(raw, "q").slice(0, 80).toLowerCase();
  const cat = one(raw, "cat");
  const mode = (PAID_OUT_MODES as readonly string[]).includes(one(raw, "mode")) ? one(raw, "mode") : "";
  const site = ["site", "office"].includes(one(raw, "site")) ? one(raw, "site") : "";
  const project = one(raw, "project");
  const range = {
    from: ISO.test(one(raw, "from")) ? one(raw, "from") : "",
    to: ISO.test(one(raw, "to")) ? one(raw, "to") : "",
  };
  const paging = readPaging(raw);

  const [all, ledger, options] = await Promise.all([
    loadExpenses(),
    loadLedger(),
    canWrite ? loadExpenseFormOptions() : Promise.resolve(null),
  ]);

  const categories = [...new Map(all.map((e) => [String(e.categoryId), e.category])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const allCategoryOptions = options
    ? options.categories.map((c) => ({ value: String(c.id), label: c.name }))
    : categories.map(([value, label]) => ({ value, label }));

  const rows = all.filter((e) => {
    if (!inRange(e.spentOn, range)) return false;
    if (cat && String(e.categoryId) !== cat) return false;
    if (mode && e.mode !== mode) return false;
    if (site === "site" && !e.projectId) return false;
    if (site === "office" && e.projectId) return false;
    if (project && e.projectId !== project) return false;
    if (
      q &&
      !`${e.category} ${e.paidTo ?? ""} ${e.details ?? ""} ${e.personName ?? ""} ${e.projectCode ?? ""} ${e.customer ?? ""} ${e.referenceNo ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });

  const total = rows.reduce((s, e) => s + e.amount, 0);
  const onSites = rows.filter((e) => e.projectId).reduce((s, e) => s + e.amount, 0);
  const office = total - onSites;
  const people = rows.filter((e) => e.personName).reduce((s, e) => s + e.amount, 0);

  // By category, largest first.
  const byCat = new Map<string, { amount: number; count: number; id: number }>();
  for (const e of rows) {
    const t = byCat.get(e.category) ?? { amount: 0, count: 0, id: e.categoryId };
    t.amount += e.amount;
    t.count += 1;
    byCat.set(e.category, t);
  }
  const catList = [...byCat.entries()].sort((a, b) => b[1].amount - a[1].amount);

  // Monthly, site against office.
  const now = new Date();
  const endKey = range.to ? range.to.slice(0, 7) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const back = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const defaultStart = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, "0")}`;
  const startKey = range.from ? range.from.slice(0, 7) : defaultStart;
  const keys: string[] = [];
  for (let [y, m] = startKey.split("-").map(Number) as [number, number]; keys.length < 36; ) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > endKey) break;
    keys.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const months = keys.map((key) => {
    const of = rows.filter((e) => e.spentOn.slice(0, 7) === key);
    return {
      key,
      label: MONTH.format(new Date(`${key}-01T00:00:00`)),
      count: of.length,
      values: {
        site: of.filter((e) => e.projectId).reduce((s, e) => s + e.amount, 0),
        office: of.filter((e) => !e.projectId).reduce((s, e) => s + e.amount, 0),
      },
    };
  });

  // Sites carrying the most spend, against what each is worth.
  const valueOf = new Map(ledger.rows.map((r) => [r.projectId, r]));
  const bySite = new Map<string, { code: string; customer: string; amount: number }>();
  for (const e of rows) {
    if (!e.projectId) continue;
    const t = bySite.get(e.projectId) ?? { code: e.projectCode ?? "—", customer: e.customer ?? "", amount: 0 };
    t.amount += e.amount;
    bySite.set(e.projectId, t);
  }
  const siteList = [...bySite.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 8);

  const pageOf = paginate(rows, paging);
  const focusProject = project ? (options?.projects.find((p) => p.id === project)?.label ?? project) : null;

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Expenses</h1>
          <p className="text-sm text-[var(--muted)]">
            {focusProject ? <>Spent on {focusProject} · </> : null}
            Material, transport, labour, fees, salary — everything paid out.
          </p>
        </div>
        {options ? <AddExpenseDialog options={options} defaultProjectId={project || undefined} /> : null}
      </div>

      <FinanceFilters
        placeholder="Search vendor, details, person, project…"
        per={pageOf.per}
        filters={[
          { name: "cat", anyLabel: "Any category", options: allCategoryOptions },
          {
            name: "site",
            anyLabel: "Sites and office",
            options: [
              { value: "site", label: "Spent on a site" },
              { value: "office", label: "Office & overhead" },
            ],
          },
          {
            name: "mode",
            anyLabel: "Any mode",
            options: PAID_OUT_MODES.map((m) => ({ value: m, label: RECEIVED_MODE_LABELS[m] })),
          },
        ]}
      />

      <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {[
          { Icon: Wallet, label: "Spent", value: `₹${compact(total)}`, hint: `${rows.length} expenses` },
          {
            Icon: HardHat,
            label: "On sites",
            value: `₹${compact(onSites)}`,
            hint: total ? `${Math.round((onSites / total) * 100)}% of spend · ${bySite.size} sites` : "—",
          },
          { Icon: Building2, label: "Office & overhead", value: `₹${compact(office)}`, hint: "not tied to a site" },
          { Icon: Receipt, label: "To people", value: `₹${compact(people)}`, hint: "salary, personal use" },
          {
            Icon: TrendingUp,
            label: "Largest category",
            value: catList[0] ? `₹${compact(catList[0][1].amount)}` : "—",
            hint: catList[0]?.[0] ?? "nothing yet",
          },
        ].map((t) => (
          <div key={t.label} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4.5 py-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--surface-2)] text-[var(--navy-text)]">
                <t.Icon size={15} strokeWidth={2.2} aria-hidden />
              </span>
              {t.label}
            </div>
            <div className="num mt-2.5 text-[24px] leading-tight font-extrabold">{t.value}</div>
            <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">{t.hint}</div>
          </div>
        ))}
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Spend by month" note="sites against office">
          <div className="px-5 pt-4 pb-5">
            <MonthlyBars months={months} series={SERIES} />
          </div>
        </Panel>
        <Panel title="By category" note={`${catList.length} in use · click to filter`}>
          {catList.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[var(--muted)]">No expense in this range.</p>
          ) : (
            <ul className="py-1.5">
              {catList.map(([name, t]) => (
                <li key={name}>
                  <Link
                    href={`/finance/expenses?cat=${t.id}${range.from ? `&from=${range.from}` : ""}${range.to ? `&to=${range.to}` : ""}`}
                    className="block px-5 py-3 text-[var(--ink)] no-underline hover:bg-[var(--surface-2)]"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{name}</span>
                      <span className="num shrink-0 text-[13.5px] font-bold">₹{compact(t.amount)}</span>
                      <span className="num w-12 shrink-0 text-right text-[12.5px] text-[var(--muted)]">{t.count}×</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--data-track)]">
                      <div
                        className="h-full rounded-full bg-[var(--data-1)]"
                        style={{ width: `${Math.max((total ? t.amount / total : 0) * 100, 1.5)}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {siteList.length ? (
        <Panel title="Sites with the most spend" note="spend against the agreed value" className="mb-4">
          <ul>
            {siteList.map(([id, s]) => {
              const value = valueOf.get(id)?.value ?? 0;
              const share = value ? s.amount / value : 0;
              return (
                <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0">
                  <Link href={`/finance/expenses?project=${id}`} className="ref shrink-0 text-[12.5px] font-bold text-[var(--navy-text)] no-underline hover:underline">
                    {s.code}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.customer}</span>
                  <span className="text-[12px] text-[var(--muted)]">
                    {value ? `${Math.round(share * 100)}% of ${inr(value)}` : "no value set"}
                  </span>
                  <span className="num w-28 shrink-0 text-right text-[14px] font-bold">{inr(s.amount)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      <Panel title="All expenses" note={`${rows.length} match · ${inr(total)}`} className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-[var(--muted)]">
            {all.length === 0 ? "No expense recorded yet." : "Nothing matches these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Spent on</th>
                  <th className="px-3 py-2.5">Site</th>
                  <th className="px-3 py-2.5">Paid to / for</th>
                  <th className="px-3 py-2.5">Mode</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  {canWrite ? <th className="w-12 px-3 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {pageOf.items.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--line-soft)] align-top last:border-b-0 hover:bg-[var(--surface-2)]">
                    <td className="px-5 py-3 text-[13px] whitespace-nowrap">{fmtDay(e.spentOn)}</td>
                    <td className="px-3 py-3">
                      <div className="text-[13.5px] font-semibold">{e.category}</div>
                      {e.details ? <div className="max-w-64 text-[12px] text-[var(--muted)]">{e.details}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      {e.projectId ? (
                        <>
                          <Link href={`/projects/${e.projectId}/payments`} className="ref text-[12px] font-bold text-[var(--navy-text)] no-underline hover:underline">
                            {e.projectCode}
                          </Link>
                          <div className="max-w-40 truncate text-[12px] text-[var(--muted)]">{e.customer}</div>
                        </>
                      ) : (
                        <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--muted)]">Office</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px]">
                      {e.personName ? <div className="font-semibold">For {e.personName}</div> : null}
                      <div className={e.personName ? "text-[12px] text-[var(--muted)]" : ""}>{e.paidTo ?? (e.personName ? "" : "—")}</div>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]">
                      {RECEIVED_MODE_LABELS[e.mode as ReceivedMode] ?? e.mode}
                      {e.referenceNo ? <div className="ref text-[11.5px] text-[var(--muted)]">{e.referenceNo}</div> : null}
                    </td>
                    <td className="num px-3 py-3 text-right text-[14px] font-bold">{inr(e.amount)}</td>
                    {canWrite ? (
                      <td className="px-3 py-2.5">
                        <DeleteExpenseButton id={e.id} summary={`${e.category}, ${inr(e.amount)} on ${fmtDay(e.spentOn)}`} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[var(--line-soft)] px-5 pb-3.5">
          <ListPager total={rows.length} page={pageOf.page} per={pageOf.per} noun="expenses" />
        </div>
      </Panel>
    </main>
  );
}
