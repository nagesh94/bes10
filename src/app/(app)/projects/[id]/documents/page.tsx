import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DocumentRowActions } from "@/components/documents/document-row-actions";
import { db } from "@/lib/db";
import { contacts, documents as documentsTable, photos as photosTable, projects } from "@/lib/db/schema";
import { DOC_CATEGORIES, DOC_CATEGORY_ORDER, DOC_TYPES, docCategory, isDocType } from "@/lib/documents/types";
import { isRegenerableDocType } from "@/lib/documents/portal-pack";
import { presignDownload } from "@/lib/storage/operations";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

/**
 * One project's own documents, arranged by category rather than upload time
 * or pipeline stage.
 *
 * The categories are the office's own filing cabinet, dictated 12 Oct 2026:
 * general, bank, legal, DISCOM, and the two photo buckets taken before and
 * after installation. `DOC_CATEGORIES` carries the four document buckets;
 * the two photo buckets live only here because photos are a separate table
 * with a separate, fixed type list (`SITE_SURVEY` is the only pre-install
 * shot, the other six are all taken after).
 */

const PRE_INSTALL_PHOTO_TYPES = new Set(["SITE_SURVEY"]);

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

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "document.read")) notFound();

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();
  const { project, contact } = row;

  const docs = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)))
    .orderBy(desc(documentsTable.uploadedAt));

  const canDelete = can(actor, "document.delete");
  const canGenerate = can(actor, "document.generate");

  const photoRows = await db
    .select()
    .from(photosTable)
    .where(eq(photosTable.projectId, id))
    .orderBy(desc(photosTable.uploadedAt));

  const photoGroups = {
    pre: photoRows.filter((p) => PRE_INSTALL_PHOTO_TYPES.has(p.photoType)),
    post: photoRows.filter((p) => !PRE_INSTALL_PHOTO_TYPES.has(p.photoType)),
  };

  const photoThumbs = new Map(
    await Promise.all(
      photoRows.map(
        async (p) => [p.id, p.s3KeyThumb ? await presignDownload(p.s3KeyThumb, 900) : null] as const,
      ),
    ),
  );

  const docGroups = DOC_CATEGORY_ORDER.map((key) => ({
    key,
    label: DOC_CATEGORIES[key].label,
    rows: docs.filter((d) => docCategory(d.docType) === key),
  }));
  const otherDocs = docs.filter((d) => docCategory(d.docType) === "other");

  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">Projects</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${project.id}`} className="no-underline">{project.code}</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span className="ref">Documents</span>
      </nav>

      <div className="mb-5">
        <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Documents</h1>
        <p className="text-sm text-[var(--muted)]">
          {fullName} · {project.code} · {docs.length} document{docs.length === 1 ? "" : "s"}, {photoRows.length}{" "}
          photo{photoRows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="space-y-6">
        {docGroups.map((group) =>
          group.rows.length === 0 ? null : (
            <section key={group.key}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold tracking-[-0.01em]">
                {group.label}
                <span className="ref text-[12px] font-semibold text-[var(--muted)]">{group.rows.length}</span>
              </h2>
              <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
                {group.rows.map((d, i) => {
                  const label = isDocType(d.docType) ? DOC_TYPES[d.docType].label : d.docType;
                  return (
                    <div
                      key={d.id}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${
                        i < group.rows.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                      }`}
                    >
                      <span className="min-w-52 flex-[2_1_240px]">
                        <span className="block text-[14px] font-semibold">{label}</span>
                        <span className="ref mt-0.5 block text-[11.5px] text-[var(--muted)]">
                          {d.fileName ?? "no file name"}
                          {d.sizeBytes ? ` · ${size(d.sizeBytes)}` : ""}
                          {d.pageCount ? ` · ${d.pageCount}pp` : ""}
                        </span>
                      </span>
                      <span className="min-w-32 shrink-0 text-right">
                        <span className="block text-[11.5px] text-[var(--muted)]">{when(d.uploadedAt)}</span>
                        {d.portalUploadedAt ? (
                          <span className="mt-0.5 block text-[10.5px] font-bold text-[var(--green-text)]">
                            on the portal
                          </span>
                        ) : null}
                      </span>
                      <DocumentRowActions
                        documentId={d.id}
                        projectId={project.id}
                        docType={d.docType}
                        canRegenerate={canGenerate && isRegenerableDocType(d.docType)}
                        canDelete={canDelete && d.docType !== "QUOTATION"}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ),
        )}

        {otherDocs.length > 0 ? (
          <section>
            <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold tracking-[-0.01em]">
              Other
              <span className="ref text-[12px] font-semibold text-[var(--muted)]">{otherDocs.length}</span>
            </h2>
            <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
              {otherDocs.map((d, i) => (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${
                    i < otherDocs.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                  }`}
                >
                  <span className="block text-[14px] font-semibold">{d.docType}</span>
                  <DocumentRowActions
                    documentId={d.id}
                    projectId={project.id}
                    docType={d.docType}
                    canRegenerate={canGenerate && isRegenerableDocType(d.docType)}
                    canDelete={canDelete && d.docType !== "QUOTATION"}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {([
          { key: "pre", label: "Pre-installation photos", rows: photoGroups.pre },
          { key: "post", label: "Post-installation photos", rows: photoGroups.post },
        ] as const).map((group) =>
          group.rows.length === 0 ? null : (
            <section key={group.key}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-bold tracking-[-0.01em]">
                {group.label}
                <span className="ref text-[12px] font-semibold text-[var(--muted)]">{group.rows.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
                {group.rows.map((p) => {
                  const url = photoThumbs.get(p.id) ?? null;
                  return (
                    <figure
                      key={p.id}
                      className="overflow-hidden rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)]"
                    >
                      <span className="block aspect-[4/3] w-full">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[11px] text-[var(--muted)]">
                            No preview
                          </span>
                        )}
                      </span>
                      <figcaption className="px-2 py-1.5 text-[10.5px] font-semibold text-[var(--muted)]">
                        {p.photoType.replaceAll("_", " ")}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          ),
        )}

        {docs.length === 0 && photoRows.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-6 py-12 text-center">
            <p className="mb-1 text-[15px] font-semibold">Nothing here yet</p>
            <p className="text-[13.5px] text-[var(--muted)]">
              No documents or photos have been uploaded or generated for this project.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
