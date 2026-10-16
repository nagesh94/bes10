import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { UploadSlot } from "@/components/documents/upload-slot";
import { PortalLink } from "@/components/flags/portal-link";
import { MeterPayment } from "@/components/installation/portal-refs";
import { db } from "@/lib/db";
import {
  applicationDetails,
  contacts,
  discomCompanies,
  documents as documentsTable,
  electricityConnections,
  externalRefs,
  projects,
} from "@/lib/db/schema";
import { can } from "@/lib/rbac/permissions";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");

export default async function Stage6Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || !can(actor, "portal.meter")) notFound();
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
  const [connection] = await db
    .select()
    .from(electricityConnections)
    .where(eq(electricityConnections.projectId, id))
    .limit(1);
  const [refs] = await db.select().from(externalRefs).where(eq(externalRefs.projectId, id)).limit(1);

  // URLs live in master data, so another zone is an admin edit, not a deploy.
  const [discom] = application?.discomCompanyId
    ? await db
        .select()
        .from(discomCompanies)
        .where(eq(discomCompanies.id, application.discomCompanyId))
        .limit(1)
    : await db.select().from(discomCompanies).limit(1);

  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));
  const receipt = docRows
    .filter((d) => d.docType === "METER_RECEIPT")
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

  return (
    <StageShell
      projectId={id}
      stageNo={6}
      width="narrow"
      note={
        <>
          The net meter fee is paid on the
          DISCOM portal, and the receipt is what the meter replacement application is built from.
        </>
      }
    >
      {connection?.consumerNumber ? (
        <div className="mb-4.5 flex flex-wrap gap-x-8 gap-y-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-5 py-4">
          <div>
            <span className="mb-0.5 block text-[12px] font-semibold text-[var(--muted)]">
              Consumer number
            </span>
            <span className="ref text-[14px] font-semibold">{connection.consumerNumber}</span>
          </div>
          {connection.nameOnBill ? (
            <div>
              <span className="mb-0.5 block text-[12px] font-semibold text-[var(--muted)]">
                Name on the bill
              </span>
              <span className="text-[14px] font-semibold">{connection.nameOnBill}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        Not Saral Sanyojan — the net meter fee is paid through the DISCOM's
        rooftop vendor portal, which is a different site from the one the name
        change and load enhancement flags link to. The host is printed on the
        card, so another zone's URL stays accurate without a wording change.
      */}
      <PortalLink
        href={discom?.meterPortalUrl ?? null}
        title="Pay the net meter fee on the DISCOM rooftop portal"
        note="vendor login · sign in as BHIM"
      />

      <section className="mb-4.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <MeterPayment
          projectId={id}
          initial={{
            meterPaymentRef: refs?.meterPaymentRef ?? "",
            meterPaidOn: day(refs?.meterPaidOn),
            meterAmount: refs?.meterAmount ?? "",
          }}
        />
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-6 py-5">
        <h2 className="mb-0.5 text-base font-bold">The receipt</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">
          This receipt <em>is</em> the meter replacement application — the DISCOM treats the paid
          receipt as the request, so there is no separate form to generate.
        </p>
        <div className="max-w-[420px]">
          <UploadSlot
            projectId={id}
            docType="METER_RECEIPT"
            label="Meter payment receipt"
            hint="The portal's own receipt — photo or PDF"
            canDelete={canDeleteDocs}
            existing={
              receipt
                ? {
                    id: receipt.id,
                    fileName: receipt.fileName,
                    sizeBytes: receipt.sizeBytes,
                    uploadedAt: receipt.uploadedAt,
                    hasPortal: Boolean(receipt.s3KeyPortal),
                  }
                : null
            }
          />
        </div>
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
