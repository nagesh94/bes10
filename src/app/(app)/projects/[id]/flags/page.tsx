import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import { can, hasRole } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";
import type { DcrFlagDetail } from "@/lib/dcr/matching";

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  IN_PROGRESS: "bg-[var(--amber-soft)] text-[var(--amber-text)]",
  RESOLVED: "bg-[var(--green-soft)] text-[var(--green-text)]",
  WAIVED: "bg-[var(--chip-soft)] text-[var(--chip-text)]",
};


export default async function FlagsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t, te] = await Promise.all([getActor(), getTranslations("flags"), getTranslations("enums")]);
  const STATUS_LABEL = (s: string) => (te.has(`flagStatus.${s}`) ? te(`flagStatus.${s}`) : s);
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
  const dcrFlag = rows.find((r) => r.type === "DCR_SERIAL_MISMATCH");
  const dcrDetail: Partial<DcrFlagDetail> = dcrFlag?.detail ? JSON.parse(dcrFlag.detail) : {};

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

  const isAdmin = hasRole(actor, "ADMIN");

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
    <StageShell
      projectId={id}
      stageNo={null}
      title={t("title")}
      note={t("note")}
    >

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-[var(--green-border)] bg-[var(--green-soft)] px-6 py-8 text-center">
          <p className="font-semibold text-[var(--green-text)]">{t("none")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4.5">
        {nameFlag ? (
          <section className="min-w-80 flex-[1_1_480px] overflow-hidden rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <h2 className="flex-1 text-[17px] font-bold">{t("nameTitle")}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase ${STATUS_CHIP[nameFlag.status]}`}>
                {STATUS_LABEL(nameFlag.status)}
              </span>
            </div>

            <div className="px-5 py-4.5">
              <div className="mb-2 text-[12px] font-semibold text-[var(--muted)]">
                {t("whatDocsSay")}
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
                        {t.has(`sources.${e.source}`) ? t(`sources.${e.source}`) : e.source}
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
                title={t("nameChangePortal")}
                note={t("otherServices")}
              />

              <div className="mb-2.5 text-[12px] font-semibold text-[var(--muted)]">
                {t("discomNeeds")}
              </div>

              <div className="mb-4 space-y-2.5">
                <UploadSlot
                  projectId={id}
                  docType="APPLICANT_PHOTO"
                  label={t("applicantPhoto")}
                  hint={t("photoOrPdf")}
                  existing={docFor("APPLICANT_PHOTO")}
                  onAttached={attachApplicantPhoto}
                  canDelete={canDeleteDocs}
                />

                <UploadSlot
                  projectId={id}
                  docType="KHASRA"
                  label={t("khasra")}
                  hint={t("khasraHint")}
                  existing={docFor("KHASRA")}
                  canDelete={canDeleteDocs}
                />

                <UploadSlot
                  projectId={id}
                  docType="NOC"
                  label={t("noc")}
                  hint={t("nocHint")}
                  existing={docFor("NOC")}
                  onAttached={attachNoc}
                  canDelete={canDeleteDocs}
                />
              </div>

              <PortalLink
                href={discom?.landRecordsUrl ?? null}
                title={t("khasraPortal")}
                note={t("landRecords")}
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
                  {t("waived", { reason: nameFlag.waiverReason })}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {loadFlag ? (
          <section className="min-w-80 flex-[1_1_420px] overflow-hidden rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <h2 className="flex-1 text-[17px] font-bold">{t("loadTitle")}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase ${STATUS_CHIP[loadFlag.status]}`}>
                {STATUS_LABEL(loadFlag.status)}
              </span>
            </div>

            <div className="px-5 py-4.5">
              <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-4.5 py-4">
                <div className="flex-[1_1_100px]">
                  <div className="text-[12px] font-semibold text-[var(--muted)]">
                    {t("sanctioned")}
                  </div>
                  <div className="ref mt-1 text-2xl font-medium text-[var(--red-text)]">
                    {loadDetail.sanctionedKw ?? "—"} kW
                  </div>
                </div>
                <span aria-hidden className="text-[var(--muted-soft)]">→</span>
                <div className="flex-[1_1_100px]">
                  <div className="text-[12px] font-semibold text-[var(--muted)]">
                    {t("needsToBe")}
                  </div>
                  <div className="ref mt-1 text-2xl font-medium text-[var(--green-text)]">
                    {loadDetail.requiredKw ?? "—"} kW
                  </div>
                </div>
              </div>

              <p className="mb-4.5 text-[13.5px] text-[var(--muted)]">
                {t("mustExceed")}
              </p>

              <PortalLink
                href={discom?.loadEnhancementUrl ?? null}
                title={t("loadPortal")}
                note={t("otherServices")}
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
                  {t("waived", { reason: loadFlag.waiverReason })}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {dcrFlag ? (
          <section className="min-w-80 flex-[1_1_420px] overflow-hidden rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <h2 className="flex-1 text-[17px] font-bold">DCR serial check</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase ${STATUS_CHIP[dcrFlag.status]}`}>
                {STATUS_LABEL(dcrFlag.status)}
              </span>
            </div>
            <div className="px-5 py-4.5">
              <p className="mb-4 text-[13.5px] text-[var(--muted)]">
                {dcrDetail.matched ?? 0} of {dcrDetail.total ?? 0} panel serials are on a stored DCR certificate.
                This clears by itself once every serial matches — upload the missing certificate, or correct the
                serial on stage 3.
              </p>

              {dcrDetail.missing?.length ? (
                <div className="mb-4">
                  <div className="mb-1.5 text-[12px] font-semibold text-[var(--muted)]">
                    Not on any certificate ({dcrDetail.missing.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dcrDetail.missing.map((s) => (
                      <span
                        key={s}
                        className="ref rounded-full border border-[var(--red-border)] bg-[var(--red-surface)] px-2.5 py-0.5 text-[12px] text-[var(--red-text)]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {dcrDetail.elsewhere?.length ? (
                <div className="mb-4">
                  <div className="mb-1.5 text-[12px] font-semibold text-[var(--muted)]">
                    Also recorded on another project ({dcrDetail.elsewhere.length})
                  </div>
                  <ul className="space-y-1 text-[13px]">
                    {dcrDetail.elsewhere.map((e) => (
                      <li key={e.serialNo}>
                        <span className="ref">{e.serialNo}</span> —{" "}
                        {e.projects.map((p, i) => (
                          <span key={p.id || i}>
                            {i > 0 ? ", " : ""}
                            {p.id ? <Link href={`/projects/${p.id}/stage-3`}>{p.label}</Link> : p.label}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mb-2 flex flex-wrap gap-2.5">
                <Link
                  href={`/projects/${id}/stage-3`}
                  className="inline-flex h-10 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-bold text-[var(--navy-text)] no-underline"
                >
                  Check serials on stage 3
                </Link>
                {can(actor, "document.upload") ? (
                  <Link
                    href="/dcr/new"
                    className="inline-flex h-10 items-center rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] no-underline"
                  >
                    Upload a DCR certificate
                  </Link>
                ) : null}
              </div>

              {isAdmin && dcrFlag.status !== "WAIVED" ? <WaiveFlag projectId={id} flagId={dcrFlag.id} /> : null}
              {dcrFlag.waiverReason ? (
                <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] text-[var(--muted)]">
                  {t("waived", { reason: dcrFlag.waiverReason })}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </StageShell>
  );
}
