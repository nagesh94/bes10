import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  discomCompanies,
  flags as flagsTable,
  loadChangeRequests,
  nameChangeRequests,
  projects,
} from "@/lib/db/schema";
import {
  LoadChangeForm,
  NameChangeForm,
  WaiveFlag,
} from "@/components/flags/flag-cards";
import { PortalLink } from "@/components/flags/portal-link";
import { UploadSlot } from "@/components/documents/upload-slot";
import { attachNameChangeDoc } from "@/app/actions/flags";
import { documents as documentsTable } from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  IN_PROGRESS: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  RESOLVED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  WAIVED: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  WAIVED: "Waived",
};

export default async function FlagsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "flag.resolve")) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();

  const rows = await db.select().from(flagsTable).where(eq(flagsTable.projectId, id));
  const [application] = await db
    .select()
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, id))
    .limit(1);

  // URLs live in master data, so another zone is an admin edit, not a deploy.
  const [discom] = application?.discomCompanyId
    ? await db
        .select()
        .from(discomCompanies)
        .where(eq(discomCompanies.id, application.discomCompanyId))
        .limit(1)
    : await db.select().from(discomCompanies).limit(1);

  const nameFlag = rows.find((r) => r.type === "NAME_MISMATCH");
  const loadFlag = rows.find((r) => r.type === "LOAD_ENHANCEMENT");

  const [nameReq] = nameFlag
    ? await db.select().from(nameChangeRequests).where(eq(nameChangeRequests.flagId, nameFlag.id)).limit(1)
    : [];
  const [loadReq] = loadFlag
    ? await db.select().from(loadChangeRequests).where(eq(loadChangeRequests.flagId, loadFlag.id)).limit(1)
    : [];

  type NameDetail = {
    entries?: Array<{ source: string; name: string; verdict: string }>;
    mismatchedSources?: string[];
  };
  type LoadDetail = { plantKw?: number; sanctionedKw?: number; requiredKw?: number };

  const nameDetail: NameDetail = nameFlag?.detail ? JSON.parse(nameFlag.detail) : {};
  const loadDetail: LoadDetail = loadFlag?.detail ? JSON.parse(loadFlag.detail) : {};

  const isAdmin = actor.role === "ADMIN";

  // Latest upload per type, so "Replace" shows the current one.
  const docRows = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));

  const docFor = (type: string) => {
    const match = docRows
      .filter((d) => d.docType === type)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
    return match
      ? {
          id: match.id,
          fileName: match.fileName,
          sizeBytes: match.sizeBytes,
          uploadedAt: match.uploadedAt,
          hasPortal: Boolean(match.s3KeyPortal),
        }
      : null;
  };

  // Server actions bound to this flag, passed down to the upload slots.
  const flagIdForName = nameFlag?.id ?? 0;
  async function attachApplicantPhoto(documentId: string) {
    "use server";
    await attachNameChangeDoc(id, flagIdForName, "applicantPhoto", documentId);
  }
  async function attachNoc(documentId: string) {
    "use server";
    await attachNameChangeDoc(id, flagIdForName, "noc", documentId);
  }

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/leads" className="no-underline">Leads</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${id}/stage-1`} className="ref no-underline">{project.code}</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>Flags</span>
      </nav>

      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Flags</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Raised automatically from the form data. Both have to close before stage 1 does.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--green-border)] bg-[var(--green-soft)] px-6 py-8 text-center">
          <p className="font-semibold text-[var(--green-text)]">No flags on this project.</p>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            The four names agree and the sanctioned load clears the plant size.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4.5">
        {nameFlag ? (
          <section className="min-w-80 flex-[1_1_480px] overflow-hidden rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <h2 className="flex-1 text-[17px] font-bold">Name change on the electricity bill</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase ${STATUS_CHIP[nameFlag.status]}`}>
                {STATUS_LABEL[nameFlag.status]}
              </span>
            </div>

            <div className="px-5 py-4.5">
              <div className="mb-2 text-[12px] font-semibold text-[var(--muted)]">
                What the documents say
              </div>
              <div className="mb-5 overflow-hidden rounded-[9px] border border-[var(--line-soft)]">
                {(nameDetail.entries ?? []).map((e, i) => {
                  const bad = e.verdict === "mismatch";
                  return (
                    <div
                      key={e.source}
                      className={`flex items-center gap-3 px-3.5 py-2.5 ${
                        bad
                          ? "border-t border-[var(--red-border)] bg-[var(--red-surface)]"
                          : i > 0
                            ? "border-t border-[var(--line-soft)]"
                            : ""
                      }`}
                    >
                      <span className="w-24 shrink-0 text-xs font-semibold text-[var(--muted)]">
                        {e.source}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold">{e.name || "—"}</span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          bad
                            ? "bg-[var(--red-soft)] text-[var(--red-text)]"
                            : "bg-[var(--green-soft)] text-[var(--green-text)]"
                        }`}
                      >
                        {bad ? "×" : "✓"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <PortalLink
                href={discom?.nameChangeUrl ?? null}
                title="Apply for a name change on Saral Sanyojan"
                note="other services"
              />

              <div className="mb-2.5 text-[12px] font-semibold text-[var(--muted)]">
                What the DISCOM needs
              </div>

              <div className="mb-4 space-y-2.5">
                <UploadSlot
                  projectId={id}
                  docType="APPLICANT_PHOTO"
                  label="Applicant photo"
                  hint="Photo or PDF"
                  existing={docFor("APPLICANT_PHOTO")}
                  onAttached={attachApplicantPhoto}
                  canDelete={canDeleteDocs}
                />

                <UploadSlot
                  projectId={id}
                  docType="KHASRA"
                  label="Khasra extract"
                  hint="Downloaded from MP Bhulekh, below"
                  existing={docFor("KHASRA")}
                  canDelete={canDeleteDocs}
                />

                <UploadSlot
                  projectId={id}
                  docType="NOC"
                  label="NOC certificate — signed scan"
                  hint="Prepared outside the app, signed, then scanned back"
                  existing={docFor("NOC")}
                  onAttached={attachNoc}
                  canDelete={canDeleteDocs}
                />
              </div>

              <PortalLink
                href={discom?.landRecordsUrl ?? null}
                title="Download the khasra from MP Bhulekh"
                note="bhu-abhilekh · land records"
              />

              <NameChangeForm
                projectId={id}
                flagId={nameFlag.id}
                khasraNumber={nameReq?.khasraNumber ?? ""}
              />

              {isAdmin && nameFlag.status !== "WAIVED" ? (
                <WaiveFlag projectId={id} flagId={nameFlag.id} />
              ) : null}
              {nameFlag.waiverReason ? (
                <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] text-[var(--muted)]">
                  Waived: {nameFlag.waiverReason}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {loadFlag ? (
          <section className="min-w-80 flex-[1_1_420px] overflow-hidden rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <h2 className="flex-1 text-[17px] font-bold">Load enhancement</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase ${STATUS_CHIP[loadFlag.status]}`}>
                {STATUS_LABEL[loadFlag.status]}
              </span>
            </div>

            <div className="px-5 py-4.5">
              <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-4.5 py-4">
                <div className="flex-[1_1_100px]">
                  <div className="text-[12px] font-semibold text-[var(--muted)]">
                    Sanctioned
                  </div>
                  <div className="ref mt-1 text-2xl font-medium text-[var(--red-text)]">
                    {loadDetail.sanctionedKw ?? "—"} kW
                  </div>
                </div>
                <span aria-hidden className="text-[var(--muted-soft)]">→</span>
                <div className="flex-[1_1_100px]">
                  <div className="text-[12px] font-semibold text-[var(--muted)]">
                    Needs to be
                  </div>
                  <div className="ref mt-1 text-2xl font-medium text-[var(--green-text)]">
                    {loadDetail.requiredKw ?? "—"} kW
                  </div>
                </div>
              </div>

              <p className="mb-4.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
                Sanctioned load must be greater than the plant size. A {loadDetail.plantKw ?? "—"} kW
                plant will not pass DISCOM inspection on a {loadDetail.sanctionedKw ?? "—"} kW
                connection.
              </p>

              <PortalLink
                href={discom?.loadEnhancementUrl ?? null}
                title="Apply for a load enhancement on Saral Sanyojan"
                note="other services"
              />

              <LoadChangeForm
                projectId={id}
                flagId={loadFlag.id}
                acknowledgementNo={loadReq?.acknowledgementNo ?? ""}
                newSanctionedKw={loadReq?.newSanctionedKw ?? ""}
              />

              {isAdmin && loadFlag.status !== "WAIVED" ? (
                <WaiveFlag projectId={id} flagId={loadFlag.id} />
              ) : null}
              {loadFlag.waiverReason ? (
                <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] text-[var(--muted)]">
                  Waived: {loadFlag.waiverReason}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
