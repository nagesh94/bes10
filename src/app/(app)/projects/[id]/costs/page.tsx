import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { paymentPlans, projects } from "@/lib/db/schema";
import { CostSheetEditor } from "@/components/finance/cost-sheet-editor";
import { AddExpenseDialog } from "@/components/finance/expense-form";
import { StageShell } from "@/components/projects/stage-shell";
import { loadCostSheet } from "@/lib/finance/cost-sheet";
import { loadExpenseFormOptions, loadExpenses } from "@/lib/finance/expenses";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * The cost calculator: what this site actually cost.
 *
 * Two halves, kept visibly apart because they are different kinds of money.
 * Material from dealers — panels, inverter, structure, boxes, cable, pipe —
 * is a quantity times a rate, proposed from installation and the rate card
 * and saved with the project. Site expenses — installation labour, agreement,
 * cement, DISCOM fees, referral — are real money paid out, recorded in
 * Expenses, and only read here.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export default async function CostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, tc] = await Promise.all([getActor(), getTranslations("payments.costs")]);
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canWrite = can(actor, "money.write");

  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();

  const [sheet, [plan], allExpenses, options] = await Promise.all([
    loadCostSheet(id),
    db.select({ totalValue: paymentPlans.totalValue }).from(paymentPlans).where(eq(paymentPlans.projectId, id)).limit(1),
    loadExpenses(),
    canWrite ? loadExpenseFormOptions() : Promise.resolve(null),
  ]);

  const agreedValue = Number(plan?.totalValue ?? 0) || 0;
  const siteExpenses = allExpenses.filter((e) => e.projectId === id);
  const expensesTotal = siteExpenses.reduce((s, e) => s + e.amount, 0);

  // One line per category worth asking about on a site: every per-site
  // category, "Other", and anything else this site has actually spent on.
  const spentBy = new Map<number, { amount: number; items: typeof siteExpenses }>();
  for (const e of siteExpenses) {
    const t = spentBy.get(e.categoryId) ?? { amount: 0, items: [] };
    t.amount += e.amount;
    t.items.push(e);
    spentBy.set(e.categoryId, t);
  }
  const categoryRows = options
    ? options.categories
        .filter((c) => c.perSite || (c.needsDetail && !c.needsPerson) || spentBy.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, hint: c.hint }))
    : [...new Map(siteExpenses.map((e) => [e.categoryId, { id: e.categoryId, name: e.category, hint: null }])).values()];
  // A retired category that still has spend on this site keeps its line.
  for (const [catId, t] of spentBy) {
    if (!categoryRows.some((c) => c.id === catId)) {
      categoryRows.push({ id: catId, name: t.items[0]!.category, hint: null });
    }
  }

  return (
    <StageShell
      projectId={id}
      stageNo={null}
      title={tc("title")}
      note={tc("note")}
    >
      <CostSheetEditor
        projectId={id}
        lines={sheet.lines}
        proposed={sheet.proposed}
        saved={sheet.saved}
        agreedValue={agreedValue}
        expensesTotal={expensesTotal}
        systemKw={sheet.systemKw}
        canWrite={canWrite}
      />

      <section className="mt-4.5 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{tc("siteExpenses")}</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
              {tc.rich("intro", {
                link: (chunks) => (
                  <Link href={`/finance/expenses?project=${id}`} className="font-semibold text-[var(--navy-text)]">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
          <span className="num text-[18px] font-extrabold">{inr(expensesTotal)}</span>
        </div>

        {categoryRows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-[var(--muted)]">{tc("none")}</p>
        ) : (
          <ul>
            {categoryRows.map((c) => {
              const t = spentBy.get(c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-[1_1_240px]">
                    <div className="text-[13.5px] font-semibold">{c.name}</div>
                    {t ? (
                      <ul className="mt-1 space-y-0.5">
                        {t.items.slice(0, 4).map((e) => (
                          <li key={e.id} className="flex gap-2 text-[12px] text-[var(--muted)]">
                            <span className="shrink-0">{DAY.format(new Date(`${e.spentOn}T00:00:00`))}</span>
                            <span className="min-w-0 flex-1 truncate">{e.details ?? e.paidTo ?? "—"}</span>
                            <span className="num shrink-0 font-semibold text-[var(--ink)]">{inr(e.amount)}</span>
                          </li>
                        ))}
                        {t.items.length > 4 ? (
                          <li className="text-[11.5px] text-[var(--muted)]">{tc("andMore", { count: t.items.length - 4 })}</li>
                        ) : null}
                      </ul>
                    ) : c.hint ? (
                      <div className="text-[12px] text-[var(--muted-soft)]">{c.hint}</div>
                    ) : null}
                  </div>
                  <span className={`num w-28 shrink-0 pt-0.5 text-right text-[14px] font-bold ${t ? "" : "text-[var(--muted-soft)]"}`}>
                    {t ? inr(t.amount) : "—"}
                  </span>
                  {options ? (
                    <AddExpenseDialog options={options} defaultProjectId={id} defaultCategoryId={c.id} label={tc("add")} ghost />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </StageShell>
  );
}
