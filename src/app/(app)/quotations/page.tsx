import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, quotations } from "@/lib/db/schema";
import { QuotationRowActions } from "@/components/quotations/quotation-actions";
import { inr } from "@/lib/quotations/content";
import { peekQuotationNumber } from "@/lib/quotations/number";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every quotation the company has raised, newest first.
 *
 * One list for both kinds — raised inside a project and raised at the
 * counter for a walk-in — because the office thinks of them as one numbered
 * series, which is exactly what they are.
 */

const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
  ISSUED: "bg-[var(--navy-soft)] text-[var(--navy)]",
  ACCEPTED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  DECLINED: "bg-[var(--red-surface)] text-[var(--red-text)]",
  EXPIRED: "bg-[var(--chip-soft)] text-[var(--muted)]",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export default async function QuotationsPage() {
  const actor = await getActor();
  if (!actor || !can(actor, "quotation.read")) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <p className="text-sm text-[var(--muted)]">You do not have access to quotations.</p>
      </main>
    );
  }

  const [rows, nextNumber] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.number,
        status: quotations.status,
        quotationDate: quotations.quotationDate,
        consumerName: quotations.consumerName,
        consumerPhone: quotations.consumerPhone,
        capacityKwp: quotations.capacityKwp,
        totalAmount: quotations.totalAmount,
        hasPdf: quotations.s3Key,
        isChosen: quotations.isChosen,
        projectId: quotations.projectId,
        projectCode: projects.code,
      })
      .from(quotations)
      .leftJoin(projects, eq(quotations.projectId, projects.id))
      .orderBy(desc(quotations.createdAt))
      .limit(200),
    peekQuotationNumber(db),
  ]);

  const accepted = rows.filter((r) => r.status === "ACCEPTED").length;

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-7 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Quotations</h1>
          <p className="text-sm text-[var(--muted)]">
            {rows.length} raised · {accepted} accepted · next is{" "}
            <span className="ref font-semibold text-[var(--ink)]">{nextNumber}</span>
          </p>
        </div>
        {can(actor, "quotation.write") ? (
          <Link
            href="/quotations/new"
            className="flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            New quotation
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center">
          <p className="mb-1 font-semibold">No quotations yet</p>
          <p className="mb-5 text-sm text-[var(--muted)]">
            The first one will be <span className="ref">{nextNumber}</span>. The series never
            restarts, so every number is used once.
          </p>
          <Link
            href="/quotations/new"
            className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            Raise the first quotation
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Q. No.", "Consumer", "Project", "Capacity", "Amount", "Date", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--line-soft)]">
                    <td className="px-5 py-3.5 align-middle">
                      <Link
                        href={`/quotations/${row.id}`}
                        className="ref text-[13px] font-medium no-underline"
                      >
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="text-sm font-semibold">{row.consumerName}</div>
                      {row.consumerPhone ? (
                        <div className="ref mt-0.5 text-[11.5px] text-[var(--muted)]">
                          {row.consumerPhone}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13px]">
                      {row.projectId && row.projectCode ? (
                        <>
                          <Link
                            href={`/projects/${row.projectId}`}
                            className="ref no-underline"
                          >
                            {row.projectCode}
                          </Link>
                          {/* A project can hold several; this says which is the offer. */}
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                              row.isChosen
                                ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                                : "bg-[var(--chip-soft)] text-[var(--muted)]"
                            }`}
                          >
                            {row.isChosen ? "Chosen" : "Alternative"}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">Standalone</span>
                      )}
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[13px] whitespace-nowrap">
                      {Number(row.capacityKwp)} kWp
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[13px] font-semibold whitespace-nowrap">
                      {inr(Number(row.totalAmount))}
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[12.5px] text-[var(--muted)] whitespace-nowrap">
                      {row.quotationDate}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          STATUS_CHIP[row.status] ?? STATUS_CHIP.DRAFT
                        }`}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right align-middle">
                      <QuotationRowActions id={row.id} hasPdf={Boolean(row.hasPdf)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
