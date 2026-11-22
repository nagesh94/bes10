import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));


export default async function Stage7Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, t, tl] = await Promise.all([getActor(), getTranslations("stage"), getTranslations("labels")]);
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
      label: tl.has(`docTypes.${docType}`) ? tl(`docTypes.${docType}`) : DOC_TYPES[docType].label,
      note: t.has(`s7.notes.${docType}`) ? t(`s7.notes.${docType}`) : "",
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
      label: tl.has(`docTypes.${item.docType}`) ? tl(`docTypes.${item.docType}`) : item.label,
      hint: tl.has(`portalHints.${item.docType}`) ? tl(`portalHints.${item.docType}`) : item.hint,
      documentId: doc?.id ?? null,
      uploaded: Boolean(doc?.portalUploadedAt),
    };
  });

  return (
    <StageShell
      projectId={id}
      stageNo={7}
      note={
        <>
          {t("s7.note")}
        </>
      }
    >
      {!install ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3.5 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-5 py-4">
          <span className="min-w-60 flex-1">
            <strong className="block text-sm font-bold text-[var(--amber-text)]">
              {t("s7.noInstall")}
            </strong>
            <span className="mt-0.5 block text-[13px] text-[var(--amber-body)]">
              {t("s7.noInstallBody")}
            </span>
          </span>
          <Link
            href={`/projects/${id}/stage-3`}
            className="inline-flex h-11 shrink-0 items-center rounded-lg border border-[var(--orange)] bg-[var(--surface)] px-4.5 text-[13.5px] font-bold text-[var(--orange-text)] no-underline"
          >
            {t("s7.goStage3")}
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
        {t("s2.backToGate")}
      </Link>
    </StageShell>
  );
}
