import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { FinanceFilters } from "@/components/finance/finance-filters";
import { ListPager } from "@/components/shell/list-controls";
import { SYSTEM_TYPE_LABEL, SYSTEM_TYPES, type SystemType } from "@/lib/estimator/engine";
import { listEstimates } from "@/lib/estimator/data";
import { inr, paginate, readPaging } from "@/lib/finance/ledger";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every pre-installation estimate, newest first.
 *
 * Standalone estimates are walk-ins being priced; attached ones belong to a
 * project the way a quotation does. Neither ever counts as real money.
 */

export const metadata: Metadata = { title: "Cost estimator" };

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, k: string) => ((Array.isArray(raw[k]) ? raw[k]![0] : raw[k]) as string | undefined)?.trim() ?? "";
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

const TYPE_CHIP: Record<SystemType, string> = {
  ON_GRID: "bg-[var(--navy-soft)] text-[var(--navy-text)]",
  HYBRID: "bg-[var(--green-soft)] text-[var(--green-text)]",
  OFF_GRID: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
};

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const actor = await getActor();
  if (!actor || !canSeeMoney(actor.roles)) notFound();

  const raw = await searchParams;
  const q = one(raw, "q").slice(0, 80).toLowerCase();
  const type = (SYSTEM_TYPES as readonly string[]).includes(one(raw, "type")) ? one(raw, "type") : "";
  const attached = ["attached", "standalone"].includes(one(raw, "attached")) ? one(raw, "attached") : "";
  const paging = readPaging(raw);

  const all = await listEstimates();
  const rows = all.filter((e) => {
    if (type && e.systemType !== type) return false;
    if (attached === "attached" && !e.projectId) return false;
    if (attached === "standalone" && e.projectId) return false;
    if (q && !`${e.number} ${e.name} ${e.phone ?? ""} ${e.projectCode ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const pageOf = paginate(rows, paging);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-5 pb-14 sm:px-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Cost estimator</h1>
          <p className="text-sm text-[var(--muted)]">
            Price a system before installation and arrive at the figure to quote. Estimates never count as expenses.
          </p>
        </div>
        {can(actor, "money.write") ? (
          <Link
            href="/estimates/new"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden />
            New estimate
          </Link>
        ) : null}
      </div>

      <FinanceFilters
        placeholder="Search name, phone, estimate or project number"
        showDates={false}
        per={pageOf.per}
        filters={[
          { name: "type", anyLabel: "Any system type", options: SYSTEM_TYPES.map((t) => ({ value: t, label: SYSTEM_TYPE_LABEL[t] })) },
          {
            name: "attached",
            anyLabel: "Attached and standalone",
            options: [
              { value: "attached", label: "Attached to a project" },
              { value: "standalone", label: "Standalone" },
            ],
          },
        ]}
      />

      <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-[13.5px] text-[var(--muted)]">
            {all.length === 0 ? "No estimate yet. Start one to price a system." : "Nothing matches these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-[11.5px] font-bold tracking-[0.04em] text-[var(--muted)] uppercase">
                  <th className="px-5 py-2.5">Estimate</th>
                  <th className="px-3 py-2.5">System</th>
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5 text-right">Our cost</th>
                  <th className="px-3 py-2.5 text-right">Without subsidy</th>
                  <th className="px-3 py-2.5 text-right">With subsidy</th>
                  <th className="px-5 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pageOf.items.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--surface-2)]">
                    <td className="px-5 py-3">
                      <Link href={`/estimates/${e.id}`} className="block text-[var(--ink)] no-underline">
                        <span className="ref text-[12px] font-bold text-[var(--navy-text)]">{e.number}</span>
                        <span className="block max-w-60 truncate text-[13.5px] font-semibold">{e.name}</span>
                        {e.phone ? <span className="ref block text-[11.5px] text-[var(--muted)]">{e.phone}</span> : null}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] font-bold ${TYPE_CHIP[e.systemType]}`}>
                        {SYSTEM_TYPE_LABEL[e.systemType]}
                      </span>
                      <div className="num mt-0.5 text-[12.5px] text-[var(--muted)]">{Number(e.capacityKw)} kW</div>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]">
                      {e.projectId ? (
                        <Link href={`/projects/${e.projectId}`} className="ref font-bold text-[var(--navy-text)] no-underline hover:underline">
                          {e.projectCode}
                        </Link>
                      ) : (
                        <span className="text-[var(--muted)]">Standalone</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right text-[13px]">{inr(Number(e.cost))}</td>
                    <td className="num px-3 py-3 text-right text-[13.5px] font-bold">{inr(Number(e.quoteWithGst))}</td>
                    <td className="num px-3 py-3 text-right text-[13.5px] font-bold text-[var(--green-text)]">{inr(Number(e.customerPays))}</td>
                    <td className="px-5 py-3 text-[12.5px] whitespace-nowrap text-[var(--muted)]">{DAY.format(e.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[var(--line-soft)] px-5 pb-3.5">
          <ListPager total={rows.length} page={pageOf.page} per={pageOf.per} noun="estimates" />
        </div>
      </section>
    </main>
  );
}
