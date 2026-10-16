import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  bankAccounts,
  banks,
  contacts,
  electricityConnections,
  flags as flagsTable,
  identityAadhaar,
  identityPan,
  otherDetails,
  panelCompanies,
  panelTypes,
  projects,
  rooftopDetails,
  siteSurveys,
  coApplicants,
} from "@/lib/db/schema";
import { CO_APPLICANT_SECTION, SECTIONS, sectionByKey } from "@/components/prospect/fields";
import { SectionForm } from "@/components/prospect/section-form";
import { UploadSlot } from "@/components/documents/upload-slot";
import { QuickGenerateAgreement } from "@/components/agreements/quick-generate";
import { PhotoGrid } from "@/components/documents/photo-grid";
import { getPhotoThumbUrls } from "@/app/actions/photos";
import type { DocType } from "@/lib/documents/types";
import { documents as documentsTable } from "@/lib/db/schema";
import { SECTION_KEYS, isSectionComplete, type SectionKey } from "@/lib/validation/prospect";
import { can } from "@/lib/rbac/permissions";
import { SectionStepper } from "@/components/prospect/section-stepper";
import { StageShell } from "@/components/projects/stage-shell";
import { getActor } from "@/lib/session";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function Stage1Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const [{ id }, { section: requested }] = await Promise.all([params, searchParams]);

  const actor = await getActor();
  if (!actor || !can(actor, "prospect.write")) notFound();
  const canDeleteDocs = can(actor, "document.delete");

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, project.contactId)).limit(1);
  const [application] = await db.select().from(applicationDetails).where(eq(applicationDetails.projectId, id)).limit(1);
  const [rooftop] = await db.select().from(rooftopDetails).where(eq(rooftopDetails.projectId, id)).limit(1);
  const [aadhaar] = await db.select().from(identityAadhaar).where(eq(identityAadhaar.projectId, id)).limit(1);
  const [pan] = await db.select().from(identityPan).where(eq(identityPan.projectId, id)).limit(1);
  const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.projectId, id)).limit(1);
  const [bill] = await db.select().from(electricityConnections).where(eq(electricityConnections.projectId, id)).limit(1);
  const [other] = await db.select().from(otherDetails).where(eq(otherDetails.projectId, id)).limit(1);
  const [survey] = await db.select().from(siteSurveys).where(eq(siteSurveys.projectId, id)).limit(1);
  const [coApplicant] = await db.select().from(coApplicants).where(eq(coApplicants.projectId, id)).limit(1);
  const flagRows = await db.select().from(flagsTable).where(eq(flagsTable.projectId, id));
  const docRows = await db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), isNull(documentsTable.deletedAt)));

  const [bankRows, panelCompanyRows, panelTypeRows] = await Promise.all([
    db.select({ name: banks.name }).from(banks).where(eq(banks.active, true)).orderBy(asc(banks.name)),
    db
      .select({ name: panelCompanies.name })
      .from(panelCompanies)
      .where(eq(panelCompanies.active, true))
      .orderBy(asc(panelCompanies.name)),
    db
      .select({ name: panelTypes.name })
      .from(panelTypes)
      .where(eq(panelTypes.active, true))
      .orderBy(asc(panelTypes.name)),
  ]);
  const comboOptions = {
    banks: bankRows.map((r) => r.name),
    panelCompanies: panelCompanyRows.map((r) => r.name),
    panelTypes: panelTypeRows.map((r) => r.name),
  };

  /** Most recent upload of a type, so "Replace" shows the current file. */
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

  // Current values per section. The Aadhaar number is never sent to the
  // browser — once saved, the field shows the masked form instead.
  const valuesFor: Record<SectionKey, Record<string, string | boolean>> = {
    user: {
      firstName: str(contact?.firstName),
      lastName: str(contact?.lastName),
      gender: str(contact?.gender),
      phone: str(contact?.phone),
      email: str(contact?.email),
      address: str(contact?.address),
      pinCode: str(contact?.pinCode),
      nationalPortalId: str(application?.nationalPortalId),
      applicationDate: str(application?.applicationDate),
      regionName: str(application?.regionName),
      circleName: str(application?.circleName),
      divisionName: str(application?.divisionName),
      zoneName: str(application?.zoneName),
      isDcr: application?.isDcr ?? true,
      wantsSubsidy: application?.wantsSubsidy ?? true,
    },
    rooftop: {
      plantKw: str(rooftop?.plantKw),
      latitude: str(rooftop?.latitude),
      longitude: str(rooftop?.longitude),
    },
    aadhaar: {
      nameOnAadhaar: str(aadhaar?.nameOnAadhaar),
      addressOnAadhaar: str(aadhaar?.addressOnAadhaar),
    },
    pan: { nameOnPan: str(pan?.nameOnPan), panNumber: str(pan?.panNumber) },
    bank: {
      bankName: str(bank?.bankName),
      accountHolderName: str(bank?.accountHolderName),
      accountNumber: str(bank?.accountNumber),
      // Pre-filled to match — it only needs retyping when the number itself
      // changes, since the real number already shows in clear above it.
      confirmAccountNumber: str(bank?.accountNumber),
      ifscCode: str(bank?.ifscCode),
    },
    electricity: {
      consumerNumber: str(bill?.consumerNumber),
      nameOnBill: str(bill?.nameOnBill),
      sanctionedLoadKw: str(bill?.sanctionedLoadKw),
      currentBillAmount: str(bill?.currentBillAmount),
    },
    other: {
      panelType: str(other?.panelType),
      panelCompany: str(other?.panelCompany),
      meterType: str(other?.meterType),
    },
    survey: {
      expectedWireLengthM: str(survey?.expectedWireLengthM),
      acCableLengthM: str(survey?.acCableLengthM),
      dcCableLengthM: str(survey?.dcCableLengthM),
      earthingLengthM: str(survey?.earthingLengthM),
      laLengthM: str(survey?.laLengthM),
      pipesRequired: str(survey?.pipesRequired),
    },
  };

  const completion = Object.fromEntries(
    SECTIONS.map((s) => [s.key, isSectionComplete(s.key as SectionKey, valuesFor[s.key as SectionKey])]),
  ) as Record<SectionKey, boolean>;

  const completeCount = Object.values(completion).filter(Boolean).length;

  // Only the eight can be the active section. The co-applicant is a panel
  // under the bank section, not a ninth peer, so it never appears here.
  const activeKey: SectionKey = (SECTION_KEYS as readonly string[]).includes(requested ?? "")
    ? (requested as SectionKey)
    : "user";
  const active = sectionByKey(activeKey)!;
  const activeIndex = SECTIONS.findIndex((s) => s.key === activeKey);
  const nextKey = activeIndex < SECTIONS.length - 1 ? SECTIONS[activeIndex + 1]!.key : null;
  const prevKey = activeIndex > 0 ? SECTIONS[activeIndex - 1]!.key : null;

  // Only fetched for the section that shows them — presigning a gallery on
  // every page load would be wasted work.
  const surveyPhotos = activeKey === "survey" ? await getPhotoThumbUrls(id, "SITE_SURVEY") : [];

  const openFlags = flagRows.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS");
  const maskedAadhaar = aadhaar?.aadhaarLast4 ? `•••• •••• ${aadhaar.aadhaarLast4}` : null;
  const coApplicantUploadsComplete = CO_APPLICANT_SECTION.uploads.every((u) => docFor(u.docType));

  return (
    <StageShell
      projectId={id}
      stageNo={1}
      note="Eight sections, the flag checks, then the payment plan. Each section saves on its own, so the form can be filled over several sittings."
      badge={
        <span
          className={`ref shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${
            completeCount >= SECTIONS.length
              ? "bg-[var(--green-soft)] text-[var(--green-text)]"
              : "bg-[var(--amber-soft)] text-[var(--amber-text)]"
          }`}
        >
          {completeCount} of {SECTIONS.length} sections
        </span>
      }
      /* The customer is in the room while this form is being filled, and
         this is where they ask for the agreement — so it is produced here
         rather than only at stage 2. */
      actions={can(actor, "agreement.write") ? <QuickGenerateAgreement projectId={id} /> : null}
    >

      {openFlags.length > 0 ? (
        <div className="mb-4.5 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-[var(--amber-border)] bg-[var(--amber-surface)] px-4 py-3.5">
          <span className="min-w-52 flex-1 text-[13.5px] text-[var(--amber-body)]">
            <strong className="text-[var(--amber-text)]">
              {openFlags.length} flag{openFlags.length > 1 ? "s" : ""} open.
            </strong>{" "}
            Stage 1 cannot close until{" "}
            {openFlags.map((f) => (f.type === "NAME_MISMATCH" ? "a name change" : "a load enhancement")).join(" and ")}{" "}
            {openFlags.length > 1 ? "are" : "is"} resolved.
          </span>
          <Link
            href={`/projects/${id}/flags`}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--orange)] px-4 text-[13px] font-bold text-[var(--orange-ink)] no-underline"
          >
            Resolve flags
          </Link>
        </div>
      ) : null}

      <section className="mb-3.5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 pt-2.5 pb-2 sm:px-5">
        <div className="mb-0.5 px-1 text-[12px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase">
          Prospect form
        </div>
        <SectionStepper
          projectId={id}
          activeKey={activeKey}
          steps={SECTIONS.map((s) => ({
            key: s.key,
            title: s.title,
            done: completion[s.key],
          }))}
        />
      </section>

      <div>
        <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-5 py-5 sm:px-6">
          {activeKey === "aadhaar" && maskedAadhaar ? (
            <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12.5px] text-[var(--muted)]">
              An Aadhaar number from before this policy changed is still on file, ending{" "}
              <span className="ref">{maskedAadhaar}</span>. The number is no longer collected — only
              the name, address and upload below.
            </p>
          ) : null}

          <SectionForm
            projectId={id}
            section={active}
            values={valuesFor[activeKey]}
            nextKey={nextKey}
            prevKey={prevKey}
            comboOptions={comboOptions}
            {...(activeKey === "bank"
              ? {
                  blockAdvance: Boolean(bank?.hasCoApplicant) && !coApplicantUploadsComplete,
                  blockAdvanceReason: "Upload the co-applicant's documents below before continuing.",
                }
              : {})}
          />

          {active.uploads?.length ? (
            <div className="mt-7 border-t border-[var(--line-soft)] pt-6">
              <h3 className="mb-0.5 text-sm font-bold">Documents for this section</h3>
              <p className="mb-4 text-[12.5px] text-[var(--muted)]">
                {active.uploadsNote ??
                  "Uploaded at full resolution for printing, with a portal-sized copy made automatically."}
              </p>
              <div className="space-y-2.5">
                {active.uploads.map((u) => (
                  <UploadSlot
                    key={u.docType}
                    projectId={id}
                    docType={u.docType as DocType}
                    label={u.label}
                    {...(u.hint === undefined ? {} : { hint: u.hint })}
                    {...(u.accept === undefined ? {} : { accept: u.accept })}
                    existing={docFor(u.docType)}
                    canDelete={canDeleteDocs}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {activeKey === "bank" && bank?.hasCoApplicant ? (
            <div className="mt-7 border-t border-[var(--line-soft)] pt-6">
              <SectionForm
                projectId={id}
                section={CO_APPLICANT_SECTION}
                values={{
                  name: str(coApplicant?.name),
                  relationship: str(coApplicant?.relationship),
                  phone: str(coApplicant?.phone),
                  email: str(coApplicant?.email),
                  occupation: str(coApplicant?.occupation),
                  panNumber: str(coApplicant?.panNumber),
                }}
                nextKey={null}
              />

              <div className="mt-6">
                <h3 className="mb-0.5 text-sm font-bold">Co-applicant documents</h3>
                <p className="mb-4 text-[12.5px] text-[var(--muted)]">
                  {CO_APPLICANT_SECTION.uploadsNote}
                </p>
                <div className="space-y-2.5">
                  {CO_APPLICANT_SECTION.uploads.map((u) => (
                    <UploadSlot
                      key={u.docType}
                      projectId={id}
                      docType={u.docType as DocType}
                      label={u.label}
                      {...("hint" in u && u.hint ? { hint: u.hint } : {})}
                      existing={docFor(u.docType)}
                      canDelete={canDeleteDocs}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeKey === "survey" ? (
            <div className="mt-7 border-t border-[var(--line-soft)] pt-6">
              <PhotoGrid
                projectId={id}
                photoType="SITE_SURVEY"
                label="Site photographs"
                hint="As many as the roof needs — one or twenty. Taken on site, they are geotagged and the coordinates are stamped into the corner."
                photos={surveyPhotos}
              />
            </div>
          ) : null}
        </section>
      </div>
    </StageShell>
  );
}
