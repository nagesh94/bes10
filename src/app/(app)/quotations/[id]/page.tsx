import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  quotationItems,
  quotationMilestones,
  quotationScopeOverrides,
  quotations,
} from "@/lib/db/schema";
import { ChooseQuotation } from "@/components/quotations/choose-quotation";
import { LinkProject } from "@/components/quotations/link-project";
import { QuotationControls } from "@/components/quotations/quotation-actions";
import { attachableProjects } from "@/app/actions/quotations";
import { QuotationForm } from "@/components/quotations/quotation-form";
import type { QuotationFormValues } from "@/lib/quotations/form-values";
import { SCOPE_ROWS } from "@/lib/quotations/content";
import { quotationMasterOptions } from "@/lib/quotations/master";
import { inr } from "@/lib/quotations/content";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * One quotation: what was offered, and the form to change it.
 *
 * Editing keeps the number and rebuilds the PDF. A quotation that came to
 * nothing is normally marked Declined or Expired rather than deleted — the
 * series reads better with every number accounted for. Delete is for the
 * ones that should never have existed, and even then the number is kept
 * back: `deleteQuotation` leaves the row and takes everything else.
 */
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "quotation.read")) notFound();

  const [row] = await db
    .select({ quotation: quotations, projectCode: projects.code })
    .from(quotations)
    .leftJoin(projects, eq(quotations.projectId, projects.id))
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
    .limit(1);
  if (!row) notFound();

  const quotation = row.quotation;

  const [items, milestones, overrides, master] = await Promise.all([
    db
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, id))
      .orderBy(asc(quotationItems.sortOrder)),
    db
      .select()
      .from(quotationMilestones)
      .where(eq(quotationMilestones.quotationId, id))
      .orderBy(asc(quotationMilestones.sortOrder)),
    db
      .select()
      .from(quotationScopeOverrides)
      .where(eq(quotationScopeOverrides.quotationId, id)),
    quotationMasterOptions(),
  ]);

  // Offered for attaching a standalone quotation after the fact. Only loaded
  // for someone who may actually move it.
  const attachable = can(actor, "quotation.write") ? await attachableProjects() : [];

  const writable = can(actor, "quotation.write");

  const initial: QuotationFormValues = {
    projectId: quotation.projectId ?? "",
    consumerTitle: (quotation.consumerTitle ?? "") as QuotationFormValues["consumerTitle"],
    consumerName: quotation.consumerName,
    consumerAddress: quotation.consumerAddress ?? "",
    consumerPhone: quotation.consumerPhone ?? "",
    quotationDate: quotation.quotationDate,
    capacityKwp: String(Number(quotation.capacityKwp)),
    systemType: quotation.systemType,
    meteringPolicy: quotation.meteringPolicy,
    totalAmount: String(Number(quotation.totalAmount)),
    structureMake: quotation.structureMake ?? "",
    panelCompany: quotation.panelCompany ?? "",
    panelModel: quotation.panelModel ?? "",
    panelWattPeak: quotation.panelWattPeak ? String(quotation.panelWattPeak) : "",
    panelCount: quotation.panelCount ? String(quotation.panelCount) : "",
    inverterMake: quotation.inverterMake ?? "",
    inverterModel: quotation.inverterModel ?? "",
    notes: quotation.notes ?? "",
    items: items.map((item) => ({
      description: item.description,
      qty: item.qty ?? "",
      make: item.make ?? "",
      remark: item.remark ?? "",
    })),
    milestones: milestones.map((m) => ({ label: m.label, schedule: m.schedule })),
    scope: SCOPE_ROWS.map((scopeRow) => {
      const override = overrides.find((o) => o.rowKey === scopeRow.key);
      return {
        key: scopeRow.key,
        byBhim: override ? override.byBhim : scopeRow.byBhim,
        byCustomer: override ? override.byCustomer : scopeRow.byCustomer,
      };
    }),
  };

  return (
    <main className="mx-auto max-w-[1100px] px-6 pt-7 pb-14">
      <div className="mb-5">
        <Link
          href="/quotations"
          className="mb-3 inline-block text-[13px] font-semibold text-[var(--link)] no-underline"
        >
          ← Quotations
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="ref text-[26px] font-bold tracking-[-0.02em]">{quotation.number}</h1>
          <span className="text-[15px] font-semibold">{quotation.consumerName}</span>
          {quotation.projectId && row.projectCode ? (
            <Link
              href={`/projects/${quotation.projectId}`}
              className="ref rounded-full bg-[var(--navy-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--navy)] no-underline"
            >
              {row.projectCode}
            </Link>
          ) : null}
        </div>
        <p className="ref mt-1 text-sm text-[var(--muted)]">
          {Number(quotation.capacityKwp)} kWp · Rs. {inr(Number(quotation.totalAmount))} ·{" "}
          {quotation.quotationDate}
          {quotation.pdfGeneratedAt ? "" : " · no PDF built yet"}
        </p>
      </div>

      <div className="mb-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-5">
        <QuotationControls
          id={quotation.id}
          status={quotation.status}
          hasPdf={Boolean(quotation.s3Key)}
          canWrite={writable}
          canDelete={can(
            actor,
            quotation.projectId ? "quotation.delete.filed" : "quotation.delete",
          )}
        />
        {quotation.projectId ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <ChooseQuotation
              id={quotation.id}
              chosen={quotation.isChosen}
              attached={writable}
            />
            <p className="min-w-60 flex-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
              {quotation.isChosen
                ? `This is ${row.projectCode}’s quotation — filed into its documents and printed in the bank loan pack.`
                : `An alternative offer on ${row.projectCode}. Another quotation is the chosen one, so this is not filed or printed. Choosing this one swaps them; neither is deleted.`}
            </p>
          </div>
        ) : null}

        {writable ? (
          <div className="mt-4.5">
            <LinkProject
              id={quotation.id}
              projectId={quotation.projectId}
              projects={attachable}
            />
          </div>
        ) : null}
      </div>

      {writable ? (
        <QuotationForm
          mode="edit"
          quotationId={quotation.id}
          number={quotation.number}
          initial={initial}
          master={master}
          projectCode={row.projectCode}
        />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          You can open this quotation but not change it.
        </p>
      )}
    </main>
  );
}
