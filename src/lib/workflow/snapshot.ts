import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationDetails,
  bankAccounts,
  batteryBanks,
  documents,
  earthingRecords,
  electricityConnections,
  externalRefs,
  flags,
  identityAadhaar,
  identityPan,
  installations,
  materialConsumption,
  otherDetails,
  panelSerials,
  paymentPlans,
  paymentsReceived,
  photos,
  projectStageProgress,
  rooftopDetails,
  siteSurveys,
  structureMembers,
  subsidies,
} from "@/lib/db/schema";
import { generatedSetFor, portalPackFor } from "@/lib/documents/portal-pack";
import { isSectionComplete, SECTION_KEYS } from "@/lib/validation/prospect";
import { REQUIRED_PHOTO_TYPES } from "./photo-requirements";
import type { PaymentMode, ProjectSnapshot } from "./stages";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Reads everything the nine gates are allowed to look at, in one pass.
 *
 * The gates themselves stay pure functions of this object, which is what
 * makes them testable without a database. This is the only place that knows
 * how a gate's question maps onto a table.
 */
export async function buildSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const [
    application,
    rooftop,
    aadhaar,
    pan,
    bank,
    bill,
    other,
    survey,
    refs,
    install,
    earthing,
    battery,
  ] = await Promise.all([
    db.select().from(applicationDetails).where(eq(applicationDetails.projectId, projectId)).limit(1),
    db.select().from(rooftopDetails).where(eq(rooftopDetails.projectId, projectId)).limit(1),
    db.select().from(identityAadhaar).where(eq(identityAadhaar.projectId, projectId)).limit(1),
    db.select().from(identityPan).where(eq(identityPan.projectId, projectId)).limit(1),
    db.select().from(bankAccounts).where(eq(bankAccounts.projectId, projectId)).limit(1),
    db.select().from(electricityConnections).where(eq(electricityConnections.projectId, projectId)).limit(1),
    db.select().from(otherDetails).where(eq(otherDetails.projectId, projectId)).limit(1),
    db.select().from(siteSurveys).where(eq(siteSurveys.projectId, projectId)).limit(1),
    db.select().from(externalRefs).where(eq(externalRefs.projectId, projectId)).limit(1),
    db.select().from(installations).where(eq(installations.projectId, projectId)).limit(1),
    db.select().from(earthingRecords).where(eq(earthingRecords.projectId, projectId)).limit(1),
    db.select().from(batteryBanks).where(eq(batteryBanks.projectId, projectId)).limit(1),
  ]);

  const a = application[0];
  const r = rooftop[0];
  const ad = aadhaar[0];
  const pn = pan[0];
  const bk = bank[0];
  const bl = bill[0];
  const ot = other[0];
  const sv = survey[0];
  const ex = refs[0];
  const ins = install[0];
  const er = earthing[0];
  const bb = battery[0];

  // Section completeness is computed with the same rule the form uses, so
  // "6 of 8" on the gate always agrees with the sidebar.
  const sectionValues: Record<string, Record<string, unknown>> = {
    user: {
      firstName: "x", // contact always exists; the form enforces the rest
      phone: "x",
      nationalPortalId: str(a?.nationalPortalId),
    },
    rooftop: { plantKw: str(r?.plantKw) },
    aadhaar: { nameOnAadhaar: str(ad?.nameOnAadhaar), aadhaarNumber: str(ad?.aadhaarLast4) },
    pan: { nameOnPan: str(pn?.nameOnPan), panNumber: str(pn?.panNumber) },
    bank: {
      bankName: str(bk?.bankName),
      accountHolderName: str(bk?.accountHolderName),
      accountNumber: str(bk?.accountNumber),
      ifscCode: str(bk?.ifscCode),
    },
    electricity: {
      consumerNumber: str(bl?.consumerNumber),
      nameOnBill: str(bl?.nameOnBill),
      sanctionedLoadKw: str(bl?.sanctionedLoadKw),
    },
    other: { panelCompany: str(ot?.panelCompany), panelModelNo: str(ot?.panelModelNo) },
    survey: {
      acCableLengthM: str(sv?.acCableLengthM),
      dcCableLengthM: str(sv?.dcCableLengthM),
      earthingLengthM: str(sv?.earthingLengthM),
    },
  };

  const prospectSectionsComplete = SECTION_KEYS.filter((k) =>
    isSectionComplete(k, sectionValues[k]!),
  ).length;

  const [flagCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(flags)
    .where(and(eq(flags.projectId, projectId), sql`${flags.status} in ('OPEN','IN_PROGRESS')`));

  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt)));
  const has = (type: string) => docRows.some((d) => d.docType === type);

  const photoRows = await db.select().from(photos).where(eq(photos.projectId, projectId));

  // Only the portal pack counts. Counting every row was wrong: a bank
  // statement is collected for the loan and the portal never asks for it, so
  // a financed project could never satisfy the stage 7 gate.
  const portalTypes = new Set<string>(
    portalPackFor(application[0]?.isDcr ?? true).map((i) => i.docType),
  );
  const uploadedToPortal = new Set(
    docRows.filter((d) => d.portalUploadedAt !== null && portalTypes.has(d.docType)).map((d) => d.docType),
  ).size;

  const [serialCount, memberCount, materialCount] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(panelSerials)
      .where(eq(panelSerials.projectId, projectId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(structureMembers)
      .where(eq(structureMembers.projectId, projectId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(materialConsumption)
      .where(eq(materialConsumption.projectId, projectId)),
  ]);

  // An installation record counts as recorded once the things every generated
  // document reads from it are present. Partially filled is not recorded —
  // the work completion report would print blanks.
  const installationRecorded = Boolean(
    ins?.installationDate &&
      ins.panelCompany &&
      ins.panelModelNo &&
      ins.totalPanels &&
      ins.inverterModelNo &&
      ins.inverterSerial &&
      ins.inverterPhase,
  );

  // Six distinct shots are required, not six photos — six of the same wall
  // would otherwise pass the gate. Site survey photos belong to stage 1 and
  // are excluded.
  const required = new Set<string>(REQUIRED_PHOTO_TYPES);
  const coveredPhotoTypes = new Set(
    photoRows.filter((p) => required.has(p.photoType)).map((p) => p.photoType),
  ).size;

  // Whether a plan is locked, and which mode it is, are workflow facts, not
  // amounts — the gate needs both and neither reveals a figure. No monetary
  // column is selected here, which is why this read is not admin-gated.
  const [planRow] = await db
    .select({ mode: paymentPlans.mode, lockedAt: paymentPlans.lockedAt })
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);

  const paymentMode: PaymentMode | null = planRow?.mode ?? null;

  const [subsidyRow] = await db
    .select({ status: subsidies.status })
    .from(subsidies)
    .where(eq(subsidies.projectId, projectId))
    .limit(1);

  const [outstandingRow] = await db
    .select({
      total: sql<number>`coalesce(${paymentPlans.totalValue}, 0)::float`,
    })
    .from(paymentPlans)
    .where(eq(paymentPlans.projectId, projectId))
    .limit(1);

  const [receivedRow] = await db
    .select({ sum: sql<number>`coalesce(sum(${paymentsReceived.amount}), 0)::float` })
    .from(paymentsReceived)
    .where(eq(paymentsReceived.projectId, projectId));

  return {
    prospectSectionsComplete,
    openFlagCount: flagCount?.n ?? 0,
    paymentPlanLocked: Boolean(planRow?.lockedAt),
    paymentMode,

    quotationUploaded: has("QUOTATION"),
    customerSignatureUploaded: has("CUSTOMER_SIGNATURE"),
    agreementGenerated: has("AGREEMENT"),
    agreementSignedScanUploaded: has("AGREEMENT_SIGNED"),
    sanctionLetterUploaded: has("SANCTION_LETTER"),

    installationRecorded,
    panelSerialsCaptured: serialCount[0]?.n ?? 0,
    panelCount: ins?.totalPanels ?? 0,
    structureMemberCount: memberCount[0]?.n ?? 0,
    isHybrid: ins?.isHybrid ?? false,
    batteryBankRecorded: Boolean(bb?.manufacturer && bb.totalCapacity),

    requiredPhotoCount: REQUIRED_PHOTO_TYPES.length,
    capturedPhotoCount: coveredPhotoTypes,
    materialRecorded: (materialCount[0]?.n ?? 0) > 0,
    earthResistanceOhms: num(er?.resistanceOhms),

    isDcr: a?.isDcr ?? true,
    dcrCertificateUploaded: has("DCR_CERTIFICATE"),
    dcrNumberRecorded: Boolean(ex?.dcrNumber),

    meterPaymentRecorded: Boolean(ex?.meterPaymentRef),
    meterReceiptUploaded: has("METER_RECEIPT"),

    generatedDocumentsReady: generatedSetFor(a?.isDcr ?? true).every((t) => has(t)),
    portalDocumentsUploaded: uploadedToPortal,
    portalDocumentsTotal: portalPackFor(a?.isDcr ?? true).length,

    performanceCheckDate: ex?.performanceCheckDate ?? null,
    commissioningCertificateGenerated: has("COMMISSIONING_CERT"),
    commissioningCertificateUploaded: has("COMMISSIONING_CERT_SIGNED"),

    wantsSubsidy: a?.wantsSubsidy ?? true,
    subsidyReceived: subsidyRow?.status === "RECEIVED",
    outstandingBalance: Math.max(
      (outstandingRow?.total ?? 0) - (receivedRow?.sum ?? 0),
      0,
    ),
  };
}

/** Which stage numbers are already marked complete. */
export async function completedStages(projectId: string): Promise<Set<number>> {
  const rows = await db
    .select()
    .from(projectStageProgress)
    .where(eq(projectStageProgress.projectId, projectId));
  return new Set(rows.filter((r) => r.status === "complete").map((r) => r.stageNo));
}
