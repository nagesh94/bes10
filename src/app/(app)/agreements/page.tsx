import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agreements, projects } from "@/lib/db/schema";
import { AgreementRowActions } from "@/components/agreements/agreement-actions";
import { ListControls, ListPager } from "@/components/shell/list-controls";
import { inr } from "@/lib/quotations/content";
import { PER_PAGE_OPTIONS, isFiltered, likePattern, readListParams } from "@/lib/list/params";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every agreement the company has drawn up, newest first.
 *
 * One list for both kinds — drawn up inside a project and drawn up at the
 * counter for a walk-in — because the office thinks of them as one pile of
 * paper, which is what they are.
 *
 * There is no number column, unlike quotations: the model agreement carries
 * no number on the paper, so one is read by consumer and execution date —
 * which is also what the search box looks through.
 *
 * Paged in the database, like the quotations list beside it: a page reads
 * its own rows and a count, never the whole table.
 */

const STATUS_CHIP: Record<string, string> = {
  DRAFT: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
  ISSUED: "bg-[var(--navy-soft)] text-[var(--navy)]",
  SIGNED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  CANCELLED: "bg-[var(--red-surface)] text-[var(--red-text)]",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SIGNED: "Signed",
  CANCELLED: "Cancelled",
};

const STATUS_FILTER = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "SIGNED", label: "Signed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "agreement.read")) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <p className="text-sm text-[var(--muted)]">You do not have access to agreements.</p>
      </main>
    );
  }

  const params = await readListParams(
    searchParams,
    STATUS_FILTER.map((option) => option.value),
  );
  const term = params.q ? likePattern(params.q) : null;

  /**
   * One `where` for the page and the count alike. Deleted agreements keep
   * their row for the record, but not their place on this list.
   */
  const where = and(
    isNull(agreements.deletedAt),
    params.status ? eq(agreements.status, params.status) : undefined,
    params.project === "attached" ? isNotNull(agreements.projectId) : undefined,
    params.project === "standalone" ? isNull(agreements.projectId) : undefined,
    term
      ? or(
          ilike(agreements.consumerName, term),
          ilike(agreements.consumerAddress, term),
          // `execution_date` is a date column, so it is cast before being
          // matched — ILIKE has no operator for a date, and an agreement is
          // often looked for by the month it was executed in.
          sql`${agreements.executionDate}::text ilike ${term}`,
          ilike(projects.code, term),
        )
      : undefined,
  );

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: agreements.id,
        status: agreements.status,
        executionDate: agreements.executionDate,
        consumerTitle: agreements.consumerTitle,
        consumerName: agreements.consumerName,
        consumerAddress: agreements.consumerAddress,
        totalValue: agreements.totalValue,
        hasFile: agreements.s3Key,
        isPrimary: agreements.isPrimary,
        projectId: agreements.projectId,
        projectCode: projects.code,
      })
      .from(agreements)
      .leftJoin(projects, eq(agreements.projectId, projects.id))
      .where(where)
      .orderBy(desc(agreements.createdAt))
      .limit(params.per)
      .offset(params.offset),
    db
      .select({
        total: count(),
        signed: sql<number>`count(*) filter (where ${agreements.status} = 'SIGNED')`.mapWith(Number),
      })
      .from(agreements)
      .leftJoin(projects, eq(agreements.projectId, projects.id))
      .where(where),
  ]);

  const total = totals?.total ?? 0;
  const signed = totals?.signed ?? 0;
  const filtered = isFiltered(params);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-7 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[26px] font-bold tracking-[-0.02em]">Agreements</h1>
          <p className="text-sm text-[var(--muted)]">
            {filtered ? `${total} matching` : `${total} drawn up`} · {signed} signed
            {filtered ? (
              <>
                {" · "}
                <Link href="/agreements" className="font-semibold">
                  Clear
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {can(actor, "agreement.write") ? (
          <Link
            href="/agreements/new"
            className="flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            New agreement
          </Link>
        ) : null}
      </div>

      <ListControls
        placeholder="Search by consumer, address, project or date"
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
            No agreement answers that search or those filters.{" "}
            <Link href="/agreements" className="font-semibold">
              Clear them
            </Link>{" "}
            to see the whole list.
          </p>
        </div>
      ) : total === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-14 text-center">
          <p className="mb-1 font-semibold">No agreements yet</p>
          <p className="mb-5 text-sm text-[var(--muted)]">
            The app builds the model agreement as a Word file for the lawyer to edit. It can be
            drawn up for a walk-in with no project, and attached to one later.
          </p>
          <Link
            href="/agreements/new"
            className="inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
          >
            Draw up the first agreement
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  {["Consumer", "Project", "Cost", "Executed", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--line)] px-5 py-2.5 text-left text-[12px] font-semibold text-[var(--muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--line-soft)]">
                    <td className="px-5 py-3.5 align-middle">
                      <Link
                        href={`/agreements/${row.id}`}
                        className="text-sm font-semibold no-underline"
                      >
                        {`${row.consumerTitle ?? ""} ${row.consumerName}`.trim()}
                      </Link>
                      <div className="mt-0.5 line-clamp-1 text-[11.5px] text-[var(--muted)]">
                        {row.consumerAddress}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[13px]">
                      {row.projectId && row.projectCode ? (
                        <>
                          <Link href={`/projects/${row.projectId}`} className="ref no-underline">
                            {row.projectCode}
                          </Link>
                          {/* A project can hold several drafts; this says
                              which one is in its documents. */}
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                              row.isPrimary
                                ? "bg-[var(--green-soft)] text-[var(--green-text)]"
                                : "bg-[var(--chip-soft)] text-[var(--muted)]"
                            }`}
                          >
                            {row.isPrimary ? "On file" : "Draft"}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">Standalone</span>
                      )}
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[13px] font-semibold whitespace-nowrap">
                      {inr(Number(row.totalValue))}
                    </td>
                    <td className="ref px-5 py-3.5 align-middle text-[12.5px] text-[var(--muted)] whitespace-nowrap">
                      {row.executionDate}
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
                      <AgreementRowActions
                        id={row.id}
                        hasFile={Boolean(row.hasFile)}
                        canDelete={can(
                          actor,
                          row.projectId ? "agreement.delete.filed" : "agreement.delete",
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
        <ListPager total={total} page={params.page} per={params.per} noun="agreements" />
      ) : null}
    </main>
  );
}
