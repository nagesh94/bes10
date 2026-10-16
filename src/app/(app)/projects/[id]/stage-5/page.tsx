import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { UploadSlot } from "@/components/documents/upload-slot";
import { PortalLink } from "@/components/flags/portal-link";
import { DcrDetails, PanelSerialsCopyBox } from "@/components/installation/portal-refs";
import { db } from "@/lib/db";
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
  const actor = await getActor();
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
          Raised on the national registry, then
          recorded here so the subsidy claim can quote it.
        </>
      }
    >
      {!isDcr ? (
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-6">
          <h2 className="mb-1 text-base font-bold">Nothing to do on this stage</h2>
          <p className="mb-4 text-[13.5px] leading-relaxed text-[var(--muted)]">
            This project is marked non-DCR, so no domestic content certificate applies and the gate
            passes without one. A non-DCR project is not eligible for the central subsidy — if that
            is wrong, the DCR flag is on the prospect form.
          </p>
          <Link
            href={`/projects/${id}/stage-1`}
            className="inline-flex h-11 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--navy)] no-underline"
          >
            Check the prospect form
          </Link>
        </div>
      ) : (
        <>
          {install?.panelCompany || install?.panelModelNo ? (
            <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-5 py-4">
              <span className="mb-1 block text-[12px] font-semibold text-[var(--muted)]">
                Certifying these modules
              </span>
              <span className="ref text-[13.5px] font-semibold">
                {install.panelCompany ?? "—"} · {install.panelModelNo ?? "—"}
                {install.totalPanels ? ` · ${install.totalPanels} panels` : ""}
                {install.panelWattPeak ? ` · ${install.panelWattPeak} Wp each` : ""}
              </span>
            </div>
          ) : (
            <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
              <strong className="block text-sm font-bold text-[var(--amber-text)]">
                No panel model recorded yet
              </strong>
              <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
                The certificate is raised against a specific model. Record the installation at stage
                3 first, or the certificate may be raised against the wrong one.
              </span>
            </div>
          )}

          <PanelSerialsCopyBox serials={serialRows.map((s) => s.serialNo)} />

          <PortalLink
            href={NATIONAL_PORTALS.dcrModule}
            title="Raise the certificate on the DCR module registry"
            note="NISE · national registry"
          />

          <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <h2 className="mb-0.5 text-base font-bold">The certificate</h2>
            <p className="mb-4 text-[13px] text-[var(--muted)]">
              Download it from the registry and upload the file here. Photo or PDF both work.
            </p>
            <div className="max-w-[420px]">
              <UploadSlot
                projectId={id}
                docType="DCR_CERTIFICATE"
                label="DCR certificate"
                hint="Downloaded from the registry above"
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
        Back to the stage gate
      </Link>
    </StageShell>
  );
}
