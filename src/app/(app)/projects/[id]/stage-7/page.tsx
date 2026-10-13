import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import {
  GeneratePack,
  InspectionDates,
  PortalChecklist,
  ProcurementForm,
  type GeneratedDoc,
  type PortalRow,
} from "@/components/documents/generate-pack";
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
import { gateMissingFields, generatedSetFor, portalPackFor } from "@/lib/documents/portal-pack";
import { NATIONAL_PORTALS } from "@/lib/portals";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const NOTES: Record<string, string> = {
  WORK_COMPLETION: "Gets the system inspected and commissioned",
  JOINT_INSPECTION: "Signed by the DISCOM, us and the consumer",
  ALMM_DECLARATION: "On company letterhead, with every module serial",
  DCR_UNDERTAKING: "Needs the procurement details below",
  COMMISSIONING_CERT: "Needs the date of commissioning below",
  SUBMISSION_PACK: "Meter receipt, ALMM, DCR undertaking, work completion, joint inspection and the commissioning certificate, merged into one PDF — needs the meter payment receipt uploaded at stage 6",
};

export default async function Stage7Page({ params }: { params: Promise<{ id: string }> }) {
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

  const [application] = await db
    .select()
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, id))
    .limit(1);
  const [install] = await db
    .select()
    .from(installations)
    .where(eq(installations.projectId, id))
    .limit(1);
  const [refs] = await db.select().from(externalRefs).where(eq(externalRefs.projectId, id)).limit(1);

  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const latestOf = (type: string) =>
    docRows
      .filter((d) => d.docType === type)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

  const isDcr = application?.isDcr ?? true;

  const generated: GeneratedDoc[] = generatedSetFor(isDcr).map((docType) => {
    const doc = latestOf(docType);
    return {
      docType,
      label: DOC_TYPES[docType].label,
      note: NOTES[docType] ?? "",
      documentId: doc?.id ?? null,
      fileName: doc?.fileName ?? null,
      generatedAt: doc?.generatedAt ?? null,
    };
  });

  const missingFields = gateMissingFields({
    commissioningDate: refs?.commissioningDate ?? null,
    isDcr,
    purchaseOrderNo: install?.purchaseOrderNo ?? null,
    purchaseOrderDate: install?.purchaseOrderDate ?? null,
    cellManufacturer: install?.cellManufacturer ?? null,
  });

  const portalRows: PortalRow[] = portalPackFor(isDcr).map((item) => {
    const doc = latestOf(item.docType);
    return {
      docType: item.docType,
      label: item.label,
      hint: item.hint,
      documentId: doc?.id ?? null,
      uploaded: Boolean(doc?.portalUploadedAt),
    };
  });

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-5 pb-14">
      <nav aria-label="Breadcrumb" className="mb-3.5 text-[13px] text-[var(--muted)]">
        <Link href="/projects" className="no-underline">Projects</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <Link href={`/projects/${id}`} className="ref no-underline">{row.project.code}</Link>
        <span className="mx-1.5 text-[var(--muted-soft)]">/</span>
        <span>Stage 7</span>
      </nav>

      <h1 className="mb-1 text-[25px] font-bold tracking-[-0.02em]">Document generation</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        {row.contact.firstName} {row.contact.lastName ?? ""} · everything the DISCOM and the
        national portal need, produced from what was recorded on the roof.
      </p>

      {!install ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              No installation record yet
            </strong>
            <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
              Every one of these documents states what went on the roof — the module model, the
              serials, the inverter. Without stage 3 there is nothing to put in them.
            </span>
          </span>
          <Link
            href={`/projects/${id}/stage-3`}
            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--orange-text)] no-underline"
          >
            Go to stage 3
          </Link>
        </div>
      ) : null}

      <div className="mb-4.5 flex flex-wrap gap-4.5">
        <section className="min-w-80 flex-[1_1_420px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <InspectionDates
            projectId={id}
            initial={{
              commissioningDate: day(refs?.commissioningDate),
              jointInspectionDate: day(refs?.jointInspectionDate),
              performanceCheckDate: day(refs?.performanceCheckDate),
            }}
          />
        </section>

        {isDcr ? (
          <section className="min-w-80 flex-[1_1_420px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
            <ProcurementForm
              projectId={id}
              initial={{
                purchaseOrderNo: str(install?.purchaseOrderNo),
                purchaseOrderDate: str(install?.purchaseOrderDate),
                cellManufacturer: str(install?.cellManufacturer),
                cellGstInvoiceNo: str(install?.cellGstInvoiceNo),
              }}
            />
          </section>
        ) : null}
      </div>

      <div className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <GeneratePack
          projectId={id}
          docs={generated}
          canDelete={canDeleteDocs}
          missingFields={missingFields}
        />
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <PortalChecklist projectId={id} rows={portalRows} portalUrl={NATIONAL_PORTALS.suryaGhar} />
      </div>

      <Link
        href={`/projects/${id}`}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--orange)] px-4.5 text-sm font-bold text-[var(--orange-ink)] no-underline"
      >
        Back to the stage gate
      </Link>
    </main>
  );
}
