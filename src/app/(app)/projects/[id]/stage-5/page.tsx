import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { UploadSlot } from "@/components/documents/upload-slot";
import { PortalLink } from "@/components/flags/portal-link";
import { DcrDetails, PanelSerialsCopyBox } from "@/components/installation/portal-refs";
import { db } from "@/lib/db";
import { checkSerials, summarise } from "@/lib/dcr/matching";
import {
  applicationDetails,
  contacts,
  documents as documentsTable,
  externalRefs,
  installations,
  panelSerials,
  projects,
} from "@/lib/db/schema";
import { NATIONAL_PORTALS } from "@/lib/portals";
import { can } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export default async function Stage5Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t] = await Promise.all([getActor(), getTranslations("stage")]);
  if (!actor || !can(actor, "portal.dcr")) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  const [application] = await db
    .select()
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, id))
    .limit(1);
  const [refs] = await db.select().from(externalRefs).where(eq(externalRefs.projectId, id)).limit(1);
  const [install] = await db
    .select()
    .from(installations)
    .where(eq(installations.projectId, id))
    .limit(1);

  const serialRows = await db
    .select()
    .from(panelSerials)
    .where(eq(panelSerials.projectId, id))
    .orderBy(asc(panelSerials.sortOrder));

  const supplierDcr = summarise(await checkSerials(id, serialRows.map((s) => s.serialNo)));

  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const certificate = docRows
    .filter((d) => d.docType === "DCR_CERTIFICATE")
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

  const isDcr = application?.isDcr ?? true;

  return (
    <StageShell
      projectId={id}
      stageNo={5}
      width="narrow"
      note={
        <>
          {t("s5.note")}
        </>
      }
    >
      {!isDcr ? (
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-6">
          <h2 className="mb-1 text-base font-bold">{t("s5.nothingToDo")}</h2>
          <p className="mb-4 text-[13.5px] text-[var(--muted)]">{t("s5.nonDcr")}</p>
          <Link
            href={`/projects/${id}/stage-1`}
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--navy-text)] no-underline"
          >
            {t("s5.checkProspect")}
          </Link>
        </div>
      ) : (
        <>
          {install?.panelCompany || install?.panelModelNo ? (
            <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-5 py-4">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--muted)]">
                {t("s5.certifying")}
              </span>
              <span className="ref text-[13.5px] font-semibold">
                {install.panelCompany ?? "—"} · {install.panelModelNo ?? "—"}
                {install.totalPanels ? ` · ${t("s5.nPanels", { count: install.totalPanels })}` : ""}
                {install.panelWattPeak ? ` · ${t("s5.wpEach", { wp: install.panelWattPeak })}` : ""}
              </span>
            </div>
          ) : (
            <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <strong className="block text-sm font-bold text-[var(--amber-text)]">
                {t("s5.noPanelModel")}
              </strong>
              <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
                {t("s5.recordStage3")}
              </span>
            </div>
          )}

          <PanelSerialsCopyBox serials={serialRows.map((s) => s.serialNo)} />

          {serialRows.length ? (
            <div
              className={`mb-4.5 rounded-[var(--radius)] border px-5 py-4 ${
                supplierDcr.matched === supplierDcr.total
                  ? "border-[var(--line)] bg-[var(--surface-2)]"
                  : "border-[var(--amber-border)] bg-[var(--amber-surface)]"
              }`}
            >
              <span className="mb-1 block text-[12px] font-semibold text-[var(--muted)]">
                Supplier&apos;s DCR certificate (B2B) for these panels
              </span>
              {supplierDcr.certificates.length ? (
                <span className="block text-[13.5px]">
                  {supplierDcr.certificates.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 ? " · " : ""}
                      <Link href={`/dcr/${c.id}`} className="ref font-semibold">
                        {c.certificateNo}
                      </Link>{" "}
                      <span className="text-[var(--muted)]">({c.count} panels)</span>
                    </span>
                  ))}
                </span>
              ) : null}
              {supplierDcr.matched < supplierDcr.total ? (
                <span className="mt-1 block text-[13px] text-[var(--amber-body)]">
                  {supplierDcr.total - supplierDcr.matched} of {supplierDcr.total} serials are not on a stored
                  certificate. <Link href={`/projects/${id}/flags`}>See the DCR flag</Link>.
                </span>
              ) : null}
              <span className="mt-1 block text-[12px] text-[var(--muted)]">
                This is the supplier&apos;s certificate. The number below is the one the portal issues for this
                customer.
              </span>
            </div>
          ) : null}

          <PortalLink
            href={NATIONAL_PORTALS.dcrModule}
            title={t("s5.portalTitle")}
            note={t("s5.portalNote")}
          />

          <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="mb-0.5 text-base font-bold">{t("s5.certificate")}</h2>
            <p className="mb-4 text-[13px] text-[var(--muted)]">{t("s5.photoOrPdf")}</p>
            <div className="max-w-[420px]">
              <UploadSlot
                projectId={id}
                docType="DCR_CERTIFICATE"
                label={t("s5.dcrCertificate")}
                hint={t("s5.dcrCertificateHint")}
                canDelete={canDeleteDocs}
                existing={
                  certificate
                    ? {
                        id: certificate.id,
                        fileName: certificate.fileName,
                        sizeBytes: certificate.sizeBytes,
                        uploadedAt: certificate.uploadedAt,
                        hasPortal: Boolean(certificate.s3KeyPortal),
                      }
                    : null
                }
              />
            </div>
          </section>

          <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <DcrDetails
              projectId={id}
              initial={{
                dcrNumber: refs?.dcrNumber ?? "",
                dcrIssuedOn: day(refs?.dcrIssuedOn),
              }}
            />
          </section>
        </>
      )}

      <Link
        href={`/projects/${id}`}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        {t("s2.backToGate")}
      </Link>
    </StageShell>
  );
}
