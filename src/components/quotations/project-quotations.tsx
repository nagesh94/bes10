import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations } from "@/lib/db/schema";
import { inr } from "@/lib/quotations/content";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { ChooseQuotation } from "./choose-quotation";
import { QuotationRowActions } from "./quotation-actions";

/**
 * The quotations raised for one project, on the project page.
 *
 * Shown wherever the project is, not only at stage 2: a customer asks for a
 * revised price long after the agreement is signed, and hunting for the
 * Quotations tab to answer them is the sort of friction that sends people
 * back to Word.
 *
 * Rendered only for roles that may read a quotation, so it is the caller's
 * job to check — this component states amounts.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export async function ProjectQuotations({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      totalAmount: quotations.totalAmount,
      capacityKwp: quotations.capacityKwp,
      quotationDate: quotations.quotationDate,
      s3Key: quotations.s3Key,
      isChosen: quotations.isChosen,
    })
    .from(quotations)
    .where(and(eq(quotations.projectId, projectId), isNull(quotations.deletedAt)))
    .orderBy(asc(quotations.number));

  // Everything listed here is attached to this project, so deleting one is
  // the admin-only decision rather than the counter-mistake one.
  const canDelete = can(await getActor(), "quotation.delete.filed");

  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4.5">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="flex-1 text-[15px] font-bold">
          Quotations
        </h2>
        {canWrite ? (
          <Link
            href={`/quotations/new?project=${projectId}`}
            className="text-[12.5px] font-bold text-[var(--link)] no-underline"
          >
            New
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          None yet.{" "}
          {canWrite
            ? "Raising one here fills the consumer details from this project and files the PDF into its documents."
            : ""}
        </p>
      ) : (
        <ul className="m-0 list-none space-y-2.5 p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              <Link
                href={`/quotations/${row.id}`}
                className="ref flex-1 text-[13px] font-semibold no-underline"
              >
                {row.number}
              </Link>
              <span className="ref text-[12.5px] text-[var(--muted)]">
                {Number(row.capacityKwp)} kWp · {inr(Number(row.totalAmount))}
              </span>
              <span className="rounded-full bg-[var(--chip-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--chip-text)]">
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
              {canWrite ? (
                <ChooseQuotation id={row.id} chosen={row.isChosen} attached />
              ) : row.isChosen ? (
                <span className="rounded-full bg-[var(--green-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--green-text)]">
                  Chosen
                </span>
              ) : null}
              <QuotationRowActions id={row.id} hasPdf={Boolean(row.s3Key)} canDelete={canDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
