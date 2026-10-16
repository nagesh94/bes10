import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import {
  GeneratePack,
  InspectionDates,
  type GeneratedDoc,
} from "@/components/documents/generate-pack";
import { UploadSlot } from "@/components/documents/upload-slot";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  documents as documentsTable,
  externalRefs,
  installations,
  projects,
} from "@/lib/db/schema";
import { DOC_TYPES } from "@/lib/documents/types";
import { gateMissingFields } from "@/lib/documents/portal-pack";
import { can } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export default async function Stage8Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "document.generate")) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, id))
    .limit(1);
  if (!row) notFound();

  const [refs] = await db.select().from(externalRefs).where(eq(externalRefs.projectId, id)).limit(1);
  const [install] = await db
    .select()
    .from(installations)
    .where(eq(installations.projectId, id))
    .limit(1);
  const [application] = await db
    .select()
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, id))
    .limit(1);
  const isDcr = application?.isDcr ?? true;

  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const latestOf = (type: string) =>
    docRows
      .filter((d) => d.docType === type)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

  const certificate = latestOf("COMMISSIONING_CERT");
  const signed = latestOf("COMMISSIONING_CERT_SIGNED");
  const meterRef = refs?.meterPaymentRef;
  const performanceCheck = refs?.performanceCheckDate ?? null;

  const generated: GeneratedDoc[] = [
    {
      docType: "COMMISSIONING_CERT",
      label: DOC_TYPES.COMMISSIONING_CERT.label,
      note: "Needs the date of commissioning below",
      documentId: certificate?.id ?? null,
      fileName: certificate?.fileName ?? null,
      generatedAt: certificate?.generatedAt ?? null,
    },
  ];

  const missingFields = gateMissingFields({
    commissioningDate: refs?.commissioningDate ?? null,
    isDcr,
    purchaseOrderNo: install?.purchaseOrderNo ?? null,
    purchaseOrderDate: install?.purchaseOrderDate ?? null,
    cellManufacturer: install?.cellManufacturer ?? null,
  });

  return (
    <StageShell
      projectId={id}
      stageNo={8}
      note={
        <>
          The net meter is in, the system has
          been checked, and Annexure-II says so.
        </>
      }
    >
      {!meterRef ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              No net meter payment on file
            </strong>
            <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
              The certificate states the system was checked{" "}
              <em>with installation of bi-directional meter</em>. If the meter is not in yet, this
              is early.
            </span>
          </span>
          <Link
            href={`/projects/${id}/stage-6`}
            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--orange-text)] no-underline"
          >
            Go to stage 6
          </Link>
        </div>
      ) : null}

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <InspectionDates
          projectId={id}
          initial={{
            commissioningDate: day(refs?.commissioningDate),
            jointInspectionDate: day(refs?.jointInspectionDate),
            performanceCheckDate: day(performanceCheck),
          }}
        />
      </section>

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <GeneratePack
          projectId={id}
          docs={generated}
          stage={8}
          canDelete={canDeleteDocs}
          missingFields={missingFields}
        />
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">The signed certificate</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          Three parties sign it — the beneficiary, our representative, and the DISCOM&apos;s nodal
          officer. The scan that comes back is filed separately and never replaces the copy we
          generated; both are kept.
        </p>
        <div className="max-w-[420px]">
          <UploadSlot
            projectId={id}
            docType="COMMISSIONING_CERT_SIGNED"
            label="Commissioning certificate — signed scan"
            hint="All three signatures, photo or PDF"
            canDelete={canDeleteDocs}
            existing={
              signed
                ? {
                    id: signed.id,
                    fileName: signed.fileName,
                    sizeBytes: signed.sizeBytes,
                    uploadedAt: signed.uploadedAt,
                    hasPortal: Boolean(signed.s3KeyPortal),
                  }
                : null
            }
          />
        </div>
        {install?.installationDate ? (
          <p className="mt-4 text-[12px] text-[var(--muted-soft)]">
            The certificate reads back the installation date recorded at stage 3
            {" "}({install.installationDate}) and the capacity
            {install.totalCapacityKw ? ` (${install.totalCapacityKw} kWp)` : ""}. Correct those at
            stage 3 and regenerate if either is wrong.
          </p>
        ) : null}
      </section>

      <Link
        href={`/projects/${id}`}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        Back to the stage gate
      </Link>
    </StageShell>
  );
}
