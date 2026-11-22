import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts, documents as documentsTable, projects } from "@/lib/db/schema";
import {
  FinanceForm,
  GiveMoneyForm,
  PaymentPlanForm,
  RecordPaymentForm,
} from "@/components/payments/payment-plan-form";
import { UploadSlot } from "@/components/documents/upload-slot";
import { getMoneyView } from "@/app/actions/payments";
import { loadLenderOptions } from "@/lib/finance/lender-options";
import { loadExpenseFormOptions, loadExpenses } from "@/lib/finance/expenses";
import { loadCostSheet } from "@/lib/finance/cost-sheet";
import { AddExpenseDialog } from "@/components/finance/expense-form";
import Link from "next/link";
import { LENDER_KIND_LABEL } from "@/lib/finance/lender-kinds";
import { RECEIVED_MODE_LABELS, TRIGGER_SHORT, type ReceivedMode } from "@/lib/payments/schedule";
import { can, canSeeMoney } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";
import { involvesFinance } from "@/lib/workflow/stages";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function LockChip() {
  const t = useTranslations("payments.page");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--locked-soft)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.06em] text-[var(--locked-text)] uppercase">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 018 0v3" />
      </svg>
      {t("adminOnly")}
    </span>
  );
}

export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t, te] = await Promise.all([
    getActor(),
    getTranslations("payments.page"),
    getTranslations("enums"),
  ]);

  // This is an admin-only route, not a page with fields hidden. An employee
  // never reaches the query at all.
  if (!actor || !canSeeMoney(actor.roles)) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  // The Jan Samarth paper. It is uploaded with the documents too — this is
  // the second door, for whoever is already on this page when the loan
  // clears. The newest row of its type wins, as everywhere else.
  const loanDocs = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const latest = (docType: string) =>
    loanDocs
      .filter((d) => d.docType === docType)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
  const existingDoc = (docType: string) => {
    const doc = latest(docType);
    return doc
      ? {
          id: doc.id,
          fileName: doc.fileName,
          sizeBytes: doc.sizeBytes,
          uploadedAt: doc.uploadedAt,
          hasPortal: Boolean(doc.s3KeyPortal),
        }
      : null;
  };

  const [view, lenderOptions, allExpenses, expenseOptions, sheet] = await Promise.all([
    getMoneyView(id),
    loadLenderOptions(),
    loadExpenses(),
    loadExpenseFormOptions(),
    loadCostSheet(id),
  ]);
  const siteExpenses = allExpenses.filter((e) => e.projectId === id);
  const siteSpent = siteExpenses.reduce((s, e) => s + e.amount, 0);
  // Only a saved sheet counts: a proposal nobody has checked is not a cost.
  const sheetTotal = sheet.saved ? sheet.lines.reduce((s, l) => s + l.amount, 0) : 0;
  const siteCost = siteSpent + sheetTotal;
  const {
    plan,
    milestones,
    received,
    advances,
    finance,
    subsidy,
    chosenQuotation,
    totalReceived,
    totalGiven,
    outstanding,
  } = view;

  const totalValue = plan?.totalValue ? Number(plan.totalValue) : 0;
  const quotedValue = Number(plan?.quotationAmount ?? chosenQuotation?.totalAmount ?? 0) || 0;
  const discount = quotedValue > 0 && totalValue > 0 ? quotedValue - totalValue : 0;
  const margin = totalValue - siteCost;
  const collectible = totalValue + totalGiven;
  const pct = collectible > 0 ? Math.min(Math.round((totalReceived / collectible) * 100), 100) : 0;
  const showFinance = involvesFinance(plan?.mode ?? null);
  // The lender is chosen in the plan above; its type decides whether the
  // Jan Samarth door is shown at all.
  const lenderKind = finance?.lenderId
    ? (lenderOptions.find((l) => l.id === finance.lenderId)?.kind ?? null)
    : null;
  const thirdParty = lenderKind === "THIRD_PARTY";
  const lenderLabel = finance?.bankName
    ? lenderKind
      ? `${finance.bankName} · ${te.has(`lenderKind.${lenderKind}`) ? te(`lenderKind.${lenderKind}`) : LENDER_KIND_LABEL[lenderKind]}`
      : finance.bankName
    : null;
  const subsidyExpected = subsidy?.expectedAmount ? Number(subsidy.expectedAmount) : 0;

  return (
    <StageShell
      projectId={id}
      stageNo={null}
      title={t("title")}
      note={t("note")}
      badge={<LockChip />}
    >

      <div className="flex flex-wrap items-start gap-4.5">
        <div className="min-w-0 flex-[999_1_560px] space-y-4.5">
          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="mb-4 text-base font-bold">{t("howPaying")}</h2>
            <PaymentPlanForm
              projectId={id}
              lenders={lenderOptions}
              initial={{
                lenderId: finance?.lenderId ?? null,
                lenderName: finance?.bankName ?? "",
                mode: (plan?.mode ?? "CASH") as "CASH" | "FINANCE" | "SPLIT",
                totalValue: plan?.totalValue ?? "",
                quotationAmount: plan?.quotationAmount ?? chosenQuotation?.totalAmount ?? "",
                quotationSource: plan?.quotationAmount ? null : (chosenQuotation?.number ?? null),
                cashComponent: plan?.cashComponent ?? "",
                financeComponent: plan?.financeComponent ?? "",
                milestones: milestones.map((m) => ({
                  amount: m.amount,
                  trigger: m.trigger,
                })),
              }}
            />
          </section>

          {showFinance ? (
            <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <h2 className="flex-1 text-base font-bold">{t("finance")}</h2>
              </div>
              <p className="mb-4 text-[13px] text-[var(--muted)]">
                {thirdParty
                  ? t("thirdParty")
                  : t("bankLoans")}
              </p>
              {thirdParty ? null : (
              <a
                href="https://www.jansamarth.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-4.5 flex items-center gap-3 rounded-[9px] bg-[var(--navy)] px-4 py-3.5 text-[var(--navy-ink)] no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t("openJanSamarth")}</span>
                  <span className="ref mt-0.5 block text-[11.5px] opacity-75">
                    {t("opensNewTab")}
                  </span>
                </span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-9 9" />
                  <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
                </svg>
              </a>
              )}
              <FinanceForm
                projectId={id}
                lenderLabel={lenderLabel}
                initial={{
                  loanAmount: finance?.loanAmount ?? "",
                  status: finance?.status ?? "NOT_APPLIED",
                }}
              />

              <div className="mt-5 space-y-2.5 border-t border-[var(--line-soft)] pt-4.5">
                <h3 className="text-[13.5px] font-bold">{t("portalPaper")}</h3>
                <UploadSlot
                  projectId={id}
                  docType="DIGITAL_APPROVAL_LETTER"
                  label={t("approvalLetter")}
                  hint={t("approvalHint")}
                  existing={existingDoc("DIGITAL_APPROVAL_LETTER")}
                  canDelete={canDeleteDocs}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-5">
              <h2 className="mb-1 text-base font-bold text-[var(--muted)]">{t("finance")}</h2>
              <p className="text-[13px] text-[var(--muted)]">{t("cashProject")}</p>
            </section>
          )}

          {received.length ? (
            <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
              <h2 className="border-b border-[var(--line)] px-6 py-4 text-base font-bold">
                {t("received")}
              </h2>
              {received.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-6 py-3.5">
                  <span className="ref min-w-28 flex-1 text-sm font-semibold">
                    {inr(Number(r.amount))}
                  </span>
                  <span className="text-[13px] text-[var(--muted)]">
                    {te.has(`receivedMode.${r.mode}`) ? te(`receivedMode.${r.mode}`) : (RECEIVED_MODE_LABELS[r.mode as ReceivedMode] ?? r.mode)}
                  </span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{r.referenceNo ?? "—"}</span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{r.receivedOn}</span>
                </div>
              ))}
            </section>
          ) : null}

          {advances.length ? (
            <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
              <div className="border-b border-[var(--line)] px-6 py-4">
                <h2 className="text-base font-bold">{t("given")}</h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">{t("recoverable")}</p>
              </div>
              {advances.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-6 py-3.5">
                  <span className="ref min-w-28 text-sm font-semibold text-[var(--red-text)]">
                    − {inr(Number(a.amount))}
                  </span>
                  <span className="min-w-32 flex-1 text-[13px] text-[var(--muted)]">
                    {a.note ?? (te.has(`receivedMode.${a.mode}`) ? te(`receivedMode.${a.mode}`) : a.mode)}
                  </span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{a.referenceNo ?? "—"}</span>
                  <span className="ref text-[12.5px] text-[var(--muted)]">{a.paidOn}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="min-w-72 flex-[1_1_320px] space-y-4.5">
          <section className="rounded-[var(--radius)] bg-[var(--navy)] px-6 py-5 text-[var(--navy-ink)]">
            <h2 className="mb-4 text-[15px] font-bold opacity-80">
              {t("whereMoney")}
            </h2>
            {[
              ...(quotedValue ? [[t("quotationAmount"), inr(quotedValue)]] : []),
              ...(discount > 0 ? [[t("discount"), `− ${inr(discount)}`]] : []),
              [t("agreedValue"), inr(totalValue)],
              ...(totalGiven ? [[t("given"), `+ ${inr(totalGiven)}`]] : []),
              [t("receivedLabel"), inr(totalReceived)],
              ...(subsidyExpected ? [[t("subsidyExpected"), `− ${inr(subsidyExpected)}`]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-2">
                <span className="text-[13px] opacity-75">{k}</span>
                <span className="ref text-[15px] font-medium">{v}</span>
              </div>
            ))}
            <div className="mt-2 flex items-baseline justify-between border-t border-white/15 pt-3.5">
              <span className="text-sm font-semibold">{t("outstanding")}</span>
              <span className="ref text-[22px] font-semibold text-[var(--orange-text)]">
                {inr(outstanding)}
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-[var(--green)]" style={{ width: `${pct}%` }} />
            </div>
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
            <h2 className="mb-3.5 text-sm font-bold">{t("recordPayment")}</h2>
            <RecordPaymentForm
              projectId={id}
              milestones={milestones.map((m) => ({
                id: m.id,
                label: `${te.has(`triggerShort.${m.trigger}`) ? te(`triggerShort.${m.trigger}`) : TRIGGER_SHORT[m.trigger]} · ${inr(Number(m.amount))}`,
              }))}
            />
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
            <h2 className="mb-1 text-sm font-bold">{t("otherWay")}</h2>
            <p className="mb-3.5 text-[12.5px] text-[var(--muted)]">{t("notDiscount")}</p>
            <GiveMoneyForm projectId={id} />
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
            <div className="mb-1 flex items-baseline gap-2">
              <h2 className="flex-1 text-sm font-bold">{t("siteCost")}</h2>
              <span className="num text-[15px] font-bold">{inr(siteCost)}</span>
            </div>
            <p className="mb-2 text-[12px] text-[var(--muted)]">
              {sheet.saved ? t("material", { amount: inr(sheetTotal) }) : t("notCosted")} ·{" "}
              {t("expenses", { amount: inr(siteSpent) })}
            </p>
            {totalValue ? (
              <p className={`mb-3 text-[12.5px] ${margin < 0 ? "font-semibold text-[var(--red-text)]" : "text-[var(--muted)]"}`}>
                {t("margin", { sign: margin < 0 ? "−" : "", amount: inr(Math.abs(margin)), value: inr(totalValue) })}
                {totalValue > 0 ? ` (${Math.round((margin / totalValue) * 100)}%)` : ""}
              </p>
            ) : (
              <p className="mb-3 text-[12.5px] text-[var(--muted)]">{t("setValue")}</p>
            )}
            {siteExpenses.length ? (
              <ul className="mb-3.5 space-y-1.5">
                {siteExpenses.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{e.category}</span>
                      {e.details ? <span className="text-[var(--muted)]"> · {e.details}</span> : null}
                    </span>
                    <span className="num font-semibold">{inr(e.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href={`/projects/${id}/costs`}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12.5px] font-bold text-[var(--navy-text)] no-underline hover:bg-[var(--surface-2)]"
              >
                {t("costCalculator")}
              </Link>
              <Link
                href={`/estimates/new?project=${id}`}
                title={t("estimateTitle")}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12.5px] font-bold text-[var(--navy-text)] no-underline hover:bg-[var(--surface-2)]"
              >
                {t("estimate")}
              </Link>
              <AddExpenseDialog options={expenseOptions} defaultProjectId={id} label={t("addExpense")} compact />
              {siteExpenses.length ? (
                <Link
                  href={`/finance/expenses?project=${id}`}
                  className="text-[12.5px] font-semibold text-[var(--navy-text)]"
                >
                  All {siteExpenses.length} →
                </Link>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </StageShell>
  );
}
