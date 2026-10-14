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
 * The quotation step inside stage 2.
 *
 * Same shape as the agreement step above it: the app makes the document, and
 * the upload slot underneath is the fallback for one priced elsewhere. Put
 * here rather than only in the Quotations tab because this is where someone
 * working a project looks for the quotation — being sent to another tab to
 * make the thing the page is asking for is exactly the friction that sends
 * people back to Word.
 *
 * Creating opens the full form rather than inlining it: the form is four
 * sections and a material table, and it arrives already filled from this
 * project's contact.
 *
 * States amounts, so the caller checks `quotation.read` before rendering it.
 */

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export async function QuotationStep({
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
      capacityKwp: quotations.capacityKwp,
      totalAmount: quotations.totalAmount,
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

  const chosen = rows.find((row) => row.isChosen) ?? null;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {canWrite ? (
          <Link
            href={`/quotations/new?project=${projectId}`}
            className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            {rows.length ? "Create another quotation" : "Create quotation"}
          </Link>
        ) : null}

        {rows.length ? (
          <Link
            href="/quotations"
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] no-underline"
          >
            All quotations
          </Link>
        ) : null}
      </div>

      {rows.length ? (
        <ul className="mt-3.5 m-0 list-none space-y-2 p-0">
          {rows.map((quotation) => (
            <li
              key={quotation.id}
              className={`flex flex-wrap items-center gap-2.5 rounded-[9px] border px-3.5 py-2.5 ${
                quotation.isChosen
                  ? "border-[var(--green-border,var(--green-text))] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--surface-2)]"
              }`}
            >
              <Link
                href={`/quotations/${quotation.id}`}
                className="ref text-[13px] font-bold no-underline"
              >
                {quotation.number}
              </Link>
              <span className="ref flex-1 text-[12.5px] text-[var(--muted)]">
                {Number(quotation.capacityKwp)} kWp · Rs. {inr(Number(quotation.totalAmount))} ·{" "}
                {quotation.quotationDate}
              </span>
              <span className="rounded-full bg-[var(--chip-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--chip-text)]">
                {STATUS_LABEL[quotation.status] ?? quotation.status}
              </span>
              {canWrite ? (
                <ChooseQuotation id={quotation.id} chosen={quotation.isChosen} attached />
              ) : quotation.isChosen ? (
                <span className="rounded-full bg-[var(--green-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--green-text)]">
                  Chosen
                </span>
              ) : null}
              <QuotationRowActions
                id={quotation.id}
                hasPdf={Boolean(quotation.s3Key)}
                canDelete={canDelete}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        The consumer block, the capacity and the letterhead are filled from this project. The
        number comes from the company series and is never reused.
        {rows.length > 1
          ? " A project can hold several quotations — 3 kW against 5 kW, say — but only the chosen one is filed below and printed in the bank loan pack. Switching keeps the others."
          : " Whatever you create here is filed below as the project’s quotation, so the bank loan pack picks it up."}
      </p>

      {rows.length > 0 && !chosen ? (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-surface)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--amber-text)]"
        >
          None of these is chosen, so this project has no quotation on file and the bank loan
          pack has nothing to print. Pick one.
        </p>
      ) : null}
    </div>
  );
}
