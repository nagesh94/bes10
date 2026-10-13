import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { DocumentRowActions } from "@/components/documents/document-row-actions";
import { db } from "@/lib/db";
import { contacts, documents as documentsTable, projects } from "@/lib/db/schema";
import { DOC_GROUPS, DOC_TYPES, docGroup, docGroupRank, isDocType } from "@/lib/documents/types";
import { isRegenerableDocType } from "@/lib/documents/portal-pack";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * Every document in the system, filed by what it is.
 *
 * The project pages are organised by stage, which is right when you are
 * working a job. This page exists for the other question — "where is that
 * consumer's cancelled cheque" — and answers it by grouping bank papers,
 * electricity bills, Aadhaar and the rest, rather than by upload time.
 *
 * `document.read` is admin and employee only, so installers and partners
 * never reach this page at all. The per-row check below is still applied
 * rather than assumed away: if the matrix ever grants an installer access to
 * their own jobs' files, this page scopes correctly without being revisited.
 */

const FILTERS = [{ key: "all", label: "Everything" }, ...DOC_GROUPS] as const;

const CLASS_TONE: Record<string, string> = {
  GENERATED: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  COLLECTED: "bg-[var(--navy-soft)] text-[var(--navy)]",
  EXTERNAL: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
  EXECUTED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  EVIDENCE: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
  PHYSICAL: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
};

function size(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const { category: requested = "all", q = "" } = await searchParams;
  const categoryFilter = FILTERS.some((f) => f.key === requested) ? requested : "all";

  const rows = await db
    .select({ doc: documentsTable, project: projects, contact: contacts })
    .from(documentsTable)
    .innerJoin(projects, eq(documentsTable.projectId, projects.id))
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(isNull(documentsTable.deletedAt))
    .orderBy(desc(documentsTable.uploadedAt))
    .limit(500);

  const canDelete = can(actor, "document.delete");
  const canGenerate = can(actor, "document.generate");

  // Installers and partners see only what is theirs. The query above is
  // deliberately broad and then filtered by the same predicate the project
  // pages use, so one rule governs both.
  const visible = rows.filter((r) =>
    can(actor, "document.read", {
      assignedEmployeeId: r.project.assignedEmployeeId,
    }),
  );

  const needle = q.trim().toLowerCase();
  const matched = visible.filter((r) => {
    if (!needle) return true;
    const label = isDocType(r.doc.docType) ? DOC_TYPES[r.doc.docType].label : r.doc.docType;
    const consumer = `${r.contact.firstName} ${r.contact.lastName ?? ""}`;
    return [r.project.code, consumer, label, r.doc.fileName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const counts = new Map<string, number>();
  for (const r of visible) {
    const key = docGroup(r.doc.docType);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const groups = [
    ...DOC_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      rows: matched
        .filter((r) => docGroup(r.doc.docType) === group.key)
        .sort(
          (a, b) =>
            docGroupRank(a.doc.docType) - docGroupRank(b.doc.docType) ||
            b.doc.uploadedAt.getTime() - a.doc.uploadedAt.getTime(),
        ),
    })),
    {
      key: "other" as const,
      label: "Other",
      rows: matched
        .filter((r) => docGroup(r.doc.docType) === "other")
        .sort((a, b) => b.doc.uploadedAt.getTime() - a.doc.uploadedAt.getTime()),
    },
  ].filter((group) => group.rows.length > 0 && (categoryFilter === "all" || group.key === categoryFilter));

  const href = (next: { category?: string; q?: string }) => {
    const params = new URLSearchParams();
    const category = next.category ?? categoryFilter;
    const query = next.q ?? q;
    if (category && category !== "all") params.set("category", category);
    if (query) params.set("q", query);
    const s = params.toString();
    return s ? `/documents?${s}` : "/documents";
  };

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Documents</h1>
          <p className="text-sm text-[var(--muted)]">
            Filed by what it is — bank, electricity bill, Aadhaar and the rest. {visible.length} in all.
          </p>
        </div>
      </div>

      <form action="/documents" className="mb-4 flex flex-wrap gap-2.5">
        {categoryFilter !== "all" ? (
          <input type="hidden" name="category" value={categoryFilter} />
        ) : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by consumer, project code, document or file name"
          aria-label="Search documents"
          className="h-11 min-w-60 flex-1 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--orange)]"
        />
        <button
          type="submit"
          className="h-11 cursor-pointer rounded-lg bg-[var(--orange)] px-5 text-sm font-bold text-[var(--orange-ink)]"
        >
          Search
        </button>
        {q ? (
          <Link
            href={href({ q: "" })}
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13.5px] font-bold text-[var(--navy)] no-underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((c) => {
          const n = c.key === "all" ? visible.length : (counts.get(c.key) ?? 0);
          if (c.key !== "all" && n === 0) return null;
          const active = categoryFilter === c.key;
          return (
            <Link
              key={c.key}
              href={href({ category: c.key })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] no-underline ${
                active
                  ? "bg-[var(--navy)] font-bold text-[var(--navy-ink)]"
                  : "border border-[var(--line)] bg-[var(--surface)] font-semibold text-[var(--muted)]"
              }`}
            >
              {c.label}
              <span className={`ref text-[11px] ${active ? "opacity-75" : "text-[var(--muted-soft)]"}`}>
                {n}
              </span>
            </Link>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <p className="mb-1 text-[15px] font-semibold">Nothing here</p>
          <p className="text-[13.5px] text-[var(--muted)]">
            {needle
              ? `No document matches "${q}".`
              : visible.length === 0
                ? "No documents have been uploaded or generated yet."
                : "Nothing in this category yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold tracking-[-0.01em]">
                {group.label}
                <span className="ref text-[12px] font-semibold text-[var(--muted)]">{group.rows.length}</span>
              </h2>
              <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
                {group.rows.map((r, i) => {
                  const label = isDocType(r.doc.docType)
                    ? DOC_TYPES[r.doc.docType].label
                    : r.doc.docType;
                  const consumer = `${r.contact.firstName} ${r.contact.lastName ?? ""}`.trim();
                  return (
                    <div
                      key={r.doc.id}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${
                        i < group.rows.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                      }`}
                    >
                      <span className="min-w-52 flex-[2_1_240px]">
                        <span className="block text-[14px] font-semibold">{label}</span>
                        <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                          {r.doc.fileName ?? "no file name"}
                          {r.doc.sizeBytes ? ` · ${size(r.doc.sizeBytes)}` : ""}
                          {r.doc.pageCount ? ` · ${r.doc.pageCount}pp` : ""}
                        </span>
                      </span>

                      <span className="min-w-40 flex-[1_1_180px]">
                        <Link
                          href={`/projects/${r.project.id}`}
                          className="ref block text-[12.5px] font-bold no-underline"
                        >
                          {r.project.code}
                        </Link>
                        <span className="mt-0.5 block text-[12px] text-[var(--muted)]">{consumer}</span>
                      </span>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-[0.04em] uppercase ${
                          CLASS_TONE[r.doc.docClass] ?? CLASS_TONE.EXTERNAL
                        }`}
                      >
                        {r.doc.docClass}
                      </span>

                      <span className="min-w-32 shrink-0 text-right">
                        <span className="block text-[11.5px] text-[var(--muted)]">
                          {when(r.doc.uploadedAt)}
                        </span>
                        {r.doc.portalUploadedAt ? (
                          <span className="mt-0.5 block text-[10.5px] font-bold text-[var(--green-text)]">
                            on the portal
                          </span>
                        ) : null}
                      </span>

                      <DocumentRowActions
                        documentId={r.doc.id}
                        projectId={r.project.id}
                        docType={r.doc.docType}
                        canRegenerate={canGenerate && isRegenerableDocType(r.doc.docType)}
                        canDelete={canDelete && r.doc.docType !== "QUOTATION"}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {visible.length >= 500 ? (
        <p className="mt-4 text-center text-[12.5px] text-[var(--muted)]">
          Showing the 500 most recent. Narrow it with the search above.
        </p>
      ) : null}
    </main>
  );
}
