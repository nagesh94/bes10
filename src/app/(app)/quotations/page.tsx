import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, quotations } from "@/lib/db/schema";
import { ListControls, ListPager } from "@/components/shell/list-controls";
import { QuotationRowActions } from "@/components/quotations/quotation-actions";
import { inr } from "@/lib/quotations/content";
import { PER_PAGE_OPTIONS, isFiltered, likePattern, readListParams } from "@/lib/list/params";
import { peekQuotationNumber } from "@/lib/quotations/number";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every quotation the company has raised, newest first.
 *
 * One list for both kinds — raised inside a project and raised at the
 * counter for a walk-in — because the office thinks of them as one numbered
 * series, which is exactly what they are.
 *
 * Paged in the database rather than in the browser: a page reads its own
 * twenty-five rows and a count, so the list costs the same whether the
 * company has raised fifty quotations or fifty thousand. The search, the
 * filters and the page size all live in the query string — see
 * `lib/list/params`.
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

const STATUS_FILTER = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "quotation.read")) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <p className="text-sm text-[var(--muted)]">You do not have access to quotations.</p>
      </main>
    );
  }

  const params = await readListParams(
    searchParams,
    STATUS_FILTER.map((option) => option.value),
  );
  const term = params.q ? likePattern(params.q) : null;

  /**
   * One `where` for both queries, so the count and the page can never
   * disagree about what is being looked at. A deleted quotation keeps its
   * row so its number stays answerable, but it is off this list.
   */
  const where = and(
    isNull(quotations.deletedAt),
    params.status ? eq(quotations.status, params.status) : undefined,
    params.project === "attached" ? isNotNull(quotations.projectId) : undefined,
    params.project === "standalone" ? isNull(quotations.projectId) : undefined,
    term
      ? or(
          ilike(quotations.number, term),
          ilike(quotations.consumerName, term),
          ilike(quotations.consumerPhone, term),
          ilike(projects.code, term),
        )
      : undefined,
  );

  const [rows, [totals], nextNumber] = await Promise.all([
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
      .where(where)
      .orderBy(desc(quotations.createdAt))
      .limit(params.per)
      .offset(params.offset),
    db
      .select({
        total: count(),
        // The chip on the heading counts within whatever is being looked at,
        // so a filtered list does not claim the whole table's figure.
        accepted: sql<number>`count(*) filter (where ${quotations.status} = 'ACCEPTED')`.mapWith(
          Number,
        ),
      })
      .from(quotations)
      .leftJoin(projects, eq(quotations.projectId, projects.id))
      .where(where),
    peekQuotationNumber(db),
  ]);

  const total = totals?.total ?? 0;
  const accepted = totals?.accepted ?? 0;
  const filtered = isFiltered(params);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-7 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Quotations</h1>
          <p className="text-sm text-[var(--muted)]">
            {filtered ? `${total} matching` : `${total} raised`} · {accepted} accepted · next is{" "}
            <span className="ref font-semibold text-[var(--ink)]">{nextNumber}</span>
            {filtered ? (
              <>
                {" · "}
                <Link href="/quotations" className="font-semibold">
                  Clear
                </Link>
              </>
            ) : null}
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

      <ListControls
        placeholder="Search by number, consumer, phone or project"
        filters={[
          { name: "status", anyLabel: "Any status", options: STATUS_FILTER },
          {
            name: "project",
            anyLabel: "Attached or not",
            options: [
              { value: "attached", label: "On a project" },
              { value: "standalone", label: "Standalone" },
            ],
          },
        ]}
        perOptions={PER_PAGE_OPTIONS}
        per={params.per}
      />

      {total === 0 && filtered ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="mb-1 font-semibold">Nothing matches</p>
          <p className="text-sm text-[var(--muted)]">
            No quotation answers that search or those filters.{" "}
            <Link href="/quotations" className="font-semibold">
              Clear them
            </Link>{" "}
            to see the whole list.
          </p>
        </div>
      ) : total === 0 ? (
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
                      <QuotationRowActions
                        id={row.id}
                        hasPdf={Boolean(row.hasPdf)}
                        canDelete={can(
                          actor,
                          row.projectId ? "quotation.delete.filed" : "quotation.delete",
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {total > 0 ? (
        <ListPager total={total} page={params.page} per={params.per} noun="quotations" />
      ) : null}
    </main>
  );
}
