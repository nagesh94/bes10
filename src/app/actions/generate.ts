"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  applicationDetails,
  auditLog,
  batteryBanks,
  batterySerials,
  companyBranches,
  contacts,
  discomCompanies,
  discomDivisions,
  documents,
  earthingRecords,
  electricityConnections,
  externalRefs,
  installations,
  materialConsumption,
  panelSerials,
  paymentPlans,
  photos,
  projects,
  subsidies,
} from "@/lib/db/schema";
import { buildAlmmDeclarationDocx } from "@/lib/documents/almm-declaration";
import type { DocContext } from "@/lib/documents/context";
import { buildCommissioningCertificateDocx } from "@/lib/documents/commissioning-certificate";
import { convertDocxToPdf } from "@/lib/documents/convert";
import { buildDcrUndertakingDocx } from "@/lib/documents/dcr-undertaking";
import { loadVendorSignature, prepareSignature } from "@/lib/documents/docx-kit";
import { buildJointInspectionDocx } from "@/lib/documents/joint-inspection";
import { imageToPdfPage, mergePdfs } from "@/lib/documents/pdf-merge";
import {
  gateMissingFields,
  generatedSetFor,
  SUBMISSION_PACK_ORDER,
  type Stage7DocType,
} from "@/lib/documents/portal-pack";
import { buildWorkCompletionDocx } from "@/lib/documents/work-completion";
import { newId } from "@/lib/projects/code";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { documentKey } from "@/lib/storage/client";
import {
  deleteDocumentObject,
  ensureBuckets,
  getDocumentObject,
  putDocument,
} from "@/lib/storage/operations";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

export type GenerateOneResult =
  | { ok: true; documentId: string; fileName: string }
  | { ok: false; error: string };

export type GenerateSetResult = {
  generated: Array<{ docType: Stage7DocType; fileName: string }>;
  failed: Array<{ docType: Stage7DocType; error: string }>;
};

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/**
 * Gathers everything the generated documents read, in one pass.
 *
 * Money is read here and merged into the file server-side. It is returned on
 * the context but never sent to a browser — the actions in this file return
 * only a file name and an id, which is what lets an employee produce the
 * joint inspection report without the figures appearing on screen.
 */
async function buildContext(projectId: string): Promise<DocContext | { error: string }> {
  const [row] = await db
    .select({ project: projects, contact: contacts })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return { error: "That project no longer exists." };

  const [branch] = await db
    .select()
    .from(companyBranches)
    .where(eq(companyBranches.isDefault, true))
    .limit(1);
  if (!branch) return { error: "No company branch is set up. Add one under Admin." };

  const [
    application,
    install,
    earthing,
    battery,
    refs,
    connection,
    plan,
    subsidy,
  ] = await Promise.all([
    db.select().from(applicationDetails).where(eq(applicationDetails.projectId, projectId)).limit(1),
    db.select().from(installations).where(eq(installations.projectId, projectId)).limit(1),
    db.select().from(earthingRecords).where(eq(earthingRecords.projectId, projectId)).limit(1),
    db.select().from(batteryBanks).where(eq(batteryBanks.projectId, projectId)).limit(1),
    db.select().from(externalRefs).where(eq(externalRefs.projectId, projectId)).limit(1),
    db.select().from(electricityConnections).where(eq(electricityConnections.projectId, projectId)).limit(1),
    db.select().from(paymentPlans).where(eq(paymentPlans.projectId, projectId)).limit(1),
    db.select().from(subsidies).where(eq(subsidies.projectId, projectId)).limit(1),
  ]);

  const ins = install[0];
  if (!ins) {
    return {
      error:
        "There is no installation record. Every one of these documents states what went on the roof, so record stage 3 first.",
    };
  }

  const [serials, cells, material] = await Promise.all([
    db.select().from(panelSerials).where(eq(panelSerials.projectId, projectId)).orderBy(asc(panelSerials.sortOrder)),
    db.select().from(batterySerials).where(eq(batterySerials.projectId, projectId)).orderBy(asc(batterySerials.sortOrder)),
    db.select().from(materialConsumption).where(eq(materialConsumption.projectId, projectId)).orderBy(asc(materialConsumption.sortOrder)),
  ]);

  const app = application[0];

  // The DISCOM row carries the company; the division carries the Executive
  // Engineer line the work completion report is addressed to.
  const [discomRow] = app?.discomCompanyId
    ? await db.select().from(discomCompanies).where(eq(discomCompanies.id, app.discomCompanyId)).limit(1)
    : await db.select().from(discomCompanies).limit(1);

  const [division] = app?.divisionName
    ? await db.select().from(discomDivisions).where(eq(discomDivisions.name, app.divisionName)).limit(1)
    : [];

  // Coordinates come from the geotagged field photos — the only place this
  // system has them. Any post-installation shot is at the same site, so the
  // first one with a fix is used.
  const photoRows = await db.select().from(photos).where(eq(photos.projectId, projectId));
  const located = photoRows.find(
    (p) => p.photoType !== "SITE_SURVEY" && p.latitude !== null && p.longitude !== null,
  );

  // Signatures. The vendor's is a constant asset; the consumer's is whatever
  // was collected at stage 2. Both are optional — a form with no signature on
  // file prints a blank line to sign, which is how these were produced
  // before, so a missing upload never blocks the document.
  const [signatureDoc] = (
    await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt)))
  )
    .filter((d) => d.docType === "CUSTOMER_SIGNATURE" && d.s3KeyOriginal)
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  const [vendorSignature, consumerSignature] = await Promise.all([
    loadVendorSignature(),
    signatureDoc?.s3KeyOriginal
      ? getDocumentObject(signatureDoc.s3KeyOriginal)
          .then((o) => prepareSignature(o.body))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const gender = (row.contact.gender ?? "").toLowerCase();

  const total = Number(plan[0]?.totalValue ?? 0);
  // Under PM Surya Ghar, a DCR installation with subsidy opted-in gets a
  // fixed CFA of 78,000 — the joint inspection report states that constant
  // rather than whatever is (or isn't yet) recorded against the subsidy row.
  const PM_SURYA_GHAR_DCR_SUBSIDY = 78000;
  const subsidyAmount =
    app?.isDcr && app?.wantsSubsidy
      ? PM_SURYA_GHAR_DCR_SUBSIDY
      : Number(subsidy[0]?.expectedAmount ?? subsidy[0]?.receivedAmount ?? 0);

  return {
    projectCode: row.project.code,
    consumer: {
      title: gender === "female" ? "Mrs." : gender === "male" ? "Mr." : "",
      name: `${row.contact.firstName} ${row.contact.lastName ?? ""}`.trim(),
      address: row.contact.address ?? "",
      pinCode: row.contact.pinCode,
      district: app?.circleName?.replace(/\s+Circle$/i, "") ?? null,
      state: "Madhya Pradesh",
      consumerNumber: connection[0]?.consumerNumber ?? null,
    },
    vendor: {
      name: branch.companyName,
      addressLine: branch.addressLine,
      city: branch.city,
      pinCode: branch.pinCode,
      phones: branch.phones,
      email: branch.email,
      gstin: branch.gstin,
      signatoryName: branch.signatoryName,
      signatoryDesignation: branch.signatoryDesignation,
      signatoryPhone: branch.signatoryPhone,
      // The forms print the address over short lines, not as one string.
      addressLines: branch.addressLine
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part, i, all) => (i < all.length - 1 ? `${part},` : part))
        .concat(branch.city.toUpperCase()),
    },
    discom: {
      companyName: discomRow?.name ?? "",
      zoneWord: discomRow?.zoneWord ?? null,
      executiveEngineerLine: division?.executiveEngineerLine ?? null,
      zoneName: app?.zoneName ?? null,
      circleName: app?.circleName ?? null,
      divisionName: app?.divisionName ?? null,
      code: discomRow?.code ?? null,
    },
    nationalPortalId: app?.nationalPortalId ?? null,
    sanctionDate: app?.sanctionDate ?? null,
    install: {
      installationDate: ins.installationDate,
      panelCompany: ins.panelCompany,
      panelModelNo: ins.panelModelNo,
      panelWattPeak: ins.panelWattPeak,
      totalPanels: ins.totalPanels,
      totalCapacityKw: ins.totalCapacityKw,
      inverterManufacturer: ins.inverterManufacturer,
      // Brand name is no longer collected separately — the manufacturer
      // field asks for it once, since the two were always the same thing.
      inverterBrand: ins.inverterManufacturer,
      inverterModelNo: ins.inverterModelNo,
      inverterSerial: ins.inverterSerial,
      inverterCapacityKw: ins.inverterCapacityKw,
      inverterCount: ins.inverterCount,
      inverterPhase: ins.inverterPhase,
      isHybrid: ins.isHybrid,
      acdbMake: ins.acdbMake,
      acdbSizeType: ins.acdbSizeType,
      acdbSpd: ins.acdbSpd,
      acdbMcb: ins.acdbMcb,
      dcdbMake: ins.dcdbMake,
      dcdbSizeType: ins.dcdbSizeType,
      dcdbSpd: ins.dcdbSpd,
      dcdbMcb: ins.dcdbMcb,
      purchaseOrderNo: ins.purchaseOrderNo,
      purchaseOrderDate: ins.purchaseOrderDate,
      cellManufacturer: ins.cellManufacturer,
      cellGstInvoiceNo: ins.cellGstInvoiceNo,
    },
    panelSerials: serials.map((s) => s.serialNo),
    material: material.map((m) => ({
      category: m.category,
      make: m.make,
      lengthM: m.lengthM,
      sizeSqmm: m.sizeSqmm,
      coreType: m.coreType,
      conductor: m.conductor,
    })),
    earthing: earthing[0]
      ? {
          resistanceOhms: earthing[0].resistanceOhms,
          wireSize: earthing[0].wireSize,
          wireType: earthing[0].wireType,
          twoSeparatePoints: earthing[0].twoSeparatePoints,
          cautionSignage: earthing[0].cautionSignage,
          omManualProvided: earthing[0].omManualProvided,
        }
      : null,
    battery:
      ins.isHybrid && battery[0]
        ? {
            manufacturer: battery[0].manufacturer,
            batteryType: battery[0].batteryType,
            cellCapacity: battery[0].cellCapacity,
            seriesCount: battery[0].seriesCount,
            parallelCount: battery[0].parallelCount,
            totalCapacity: battery[0].totalCapacity,
            totalVoltage: battery[0].totalVoltage,
            serials: cells.map((c) => c.serialNo),
          }
        : null,
    geo:
      located && located.latitude && located.longitude
        ? { latitude: str(located.latitude)!, longitude: str(located.longitude)! }
        : null,
    dates: {
      commissioning: refs[0]?.commissioningDate ?? null,
      jointInspection: refs[0]?.jointInspectionDate ?? null,
      performanceCheck: refs[0]?.performanceCheckDate ?? null,
    },
    money:
      total > 0
        ? {
            totalProjectCost: total,
            subsidyAmount,
            paidByBeneficiary: Math.max(total - subsidyAmount, 0),
          }
        : null,
    signatures: { vendor: vendorSignature, consumer: consumerSignature },
  };
}

const SLUG: Record<Stage7DocType, string> = {
  WORK_COMPLETION: "work-completion-report",
  JOINT_INSPECTION: "joint-inspection-report",
  ALMM_DECLARATION: "almm-declaration",
  DCR_UNDERTAKING: "dcr-undertaking-annexure-i",
  COMMISSIONING_CERT: "commissioning-certificate-annexure-ii",
  SUBMISSION_PACK: "submission-pack",
};

/** Every generated docType except the pack itself, which `render` cannot produce — it is a merge of the others, not a template. */
type RenderableDocType = Exclude<Stage7DocType, "SUBMISSION_PACK">;

async function render(docType: RenderableDocType, ctx: DocContext): Promise<Buffer> {
  switch (docType) {
    case "WORK_COMPLETION":
      return buildWorkCompletionDocx(ctx);
    case "JOINT_INSPECTION":
      return buildJointInspectionDocx(ctx);
    case "ALMM_DECLARATION":
      // The only one on letterhead; it builds its own header and footer.
      return buildAlmmDeclarationDocx(ctx);
    case "DCR_UNDERTAKING":
      return buildDcrUndertakingDocx(ctx);
    case "COMMISSIONING_CERT":
      return buildCommissioningCertificateDocx(ctx);
  }
}

/**
 * Merges the submission pack: the meter payment receipt plus five of the
 * other generated documents, into one PDF, in the order dictated 13 Oct
 * 2026 — work completion before joint inspection, which is neither
 * alphabetical nor the order the portal pack above lists them in.
 *
 * Each .docx is rendered fresh from the current project data, the same as a
 * standalone "Regenerate" would produce, then converted to PDF by Gotenberg
 * (`convertDocxToPdf`) so it can be concatenated with the meter receipt —
 * that file is the one input that never existed as a docx: it was uploaded
 * from the DISCOM portal as whatever it is, PDF or a phone photo.
 */
async function buildSubmissionPack(
  projectId: string,
  ctx: DocContext,
  isDcr: boolean,
): Promise<Buffer> {
  const pages: Buffer[] = [];

  for (const docType of SUBMISSION_PACK_ORDER) {
    if (docType === "DCR_UNDERTAKING" && !isDcr) continue;

    if (docType === "METER_RECEIPT") {
      const meterDoc = (
        await db
          .select()
          .from(documents)
          .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt)))
      )
        .filter((d) => d.docType === "METER_RECEIPT" && d.s3KeyOriginal)
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
      if (!meterDoc?.s3KeyOriginal) {
        throw new Error(
          "The meter payment receipt has not been uploaded yet (stage 6). Upload it before the submission pack can be merged.",
        );
      }
      const obj = await getDocumentObject(meterDoc.s3KeyOriginal);
      pages.push(
        obj.contentType.includes("pdf") ? obj.body : await imageToPdfPage(obj.body, obj.contentType),
      );
      continue;
    }

    const docxBuffer = await render(docType as RenderableDocType, ctx);
    pages.push(await convertDocxToPdf(docxBuffer, `${SLUG[docType as Stage7DocType]}.docx`));
  }

  return mergePdfs(pages);
}

/**
 * Produces one document and files it.
 *
 * A regenerated document replaces whatever was filed under that docType
 * before: the old row and its stored objects are deleted once the new one is
 * safely in place. These are machine-generated from the current project
 * data, not collected paperwork, so an old copy sitting alongside the new
 * one is never the record of anything — it is just a stale duplicate that
 * made ALMM, commissioning and the rest pile up in the documents list every
 * time someone regenerated. (Flagged 12 Oct 2026.)
 */
export async function generateDocument(
  projectId: string,
  docType: Stage7DocType,
): Promise<GenerateOneResult> {
  const actor = await getActor();
  assertCan(actor, "document.generate");

  const ctx = await buildContext(projectId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const [app] = await db
    .select({ isDcr: applicationDetails.isDcr })
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, projectId))
    .limit(1);
  const isDcr = app?.isDcr ?? true;

  const missingGate = gateMissingFields({
    commissioningDate: ctx.dates.commissioning,
    isDcr,
    purchaseOrderNo: ctx.install.purchaseOrderNo,
    purchaseOrderDate: ctx.install.purchaseOrderDate,
    cellManufacturer: ctx.install.cellManufacturer,
  });
  if (missingGate.length) {
    return {
      ok: false,
      error: `Fill in the ${missingGate.join(", ")} before any of these documents can be generated.`,
    };
  }

  let buffer: Buffer;
  let mimeType: string;
  let extension: string;
  if (docType === "SUBMISSION_PACK") {
    try {
      buffer = await buildSubmissionPack(projectId, ctx, isDcr);
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
    mimeType = PDF_MIME;
    extension = "pdf";
  } else {
    buffer = await render(docType, ctx);
    mimeType = DOCX_MIME;
    extension = "docx";
  }

  await ensureBuckets();
  const fileName = `${ctx.projectCode}-${SLUG[docType]}.${extension}`;
  const key = documentKey(projectId, docType, "original", fileName);
  await putDocument(key, buffer, mimeType);

  const existing = (
    await db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt)))
  ).filter((d) => d.docType === docType);

  const documentId = newId("doc");
  await db.insert(documents).values({
    id: documentId,
    projectId,
    docType,
    docClass: "GENERATED",
    status: "GENERATED",
    fileName,
    mimeType,
    sizeBytes: buffer.byteLength,
    s3KeyOriginal: key,
    generatedAt: new Date(),
    uploadedBy: actor.id,
  });

  // The new copy is already filed — safe now to remove whatever this one
  // replaces, row and stored objects both.
  for (const old of existing) {
    await db.delete(documents).where(eq(documents.id, old.id));
    for (const oldKey of [old.s3KeyOriginal, old.s3KeyPortal, old.s3KeyThumb]) {
      if (oldKey) await deleteDocumentObject(oldKey);
    }
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "document.generate",
    entityType: "document",
    entityId: documentId,
    projectId,
    after: { docType, fileName, regenerated: existing.length > 0, replaced: existing.length },
  });

  revalidatePath(`/projects/${projectId}/stage-7`);
  revalidatePath(`/projects/${projectId}/stage-8`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/documents");
  return { ok: true, documentId, fileName };
}

/**
 * Produces the whole set in one go.
 *
 * Each document is attempted independently so one missing field does not cost
 * the other three — the page then shows exactly which failed and why, rather
 * than a single unhelpful error for the batch.
 */
export async function generateAll(
  projectId: string,
  stage: 7 | 8 = 7,
): Promise<GenerateSetResult> {
  const actor = await getActor();
  assertCan(actor, "document.generate");

  const [app] = await db
    .select({ isDcr: applicationDetails.isDcr })
    .from(applicationDetails)
    .where(eq(applicationDetails.projectId, projectId))
    .limit(1);

  const generated: GenerateSetResult["generated"] = [];
  const failed: GenerateSetResult["failed"] = [];

  for (const docType of generatedSetFor(app?.isDcr ?? true, stage)) {
    // Each document is attempted in its own try. A builder that throws — a
    // malformed signature image, an unexpected null — would otherwise abort
    // the loop and take the remaining documents with it, and the page would
    // show no error at all because the action never returned.
    try {
      const result = await generateDocument(projectId, docType);
      if (result.ok) generated.push({ docType, fileName: result.fileName });
      else failed.push({ docType, error: result.error });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[generate] ${docType} failed for ${projectId}:`, cause);
      failed.push({ docType, error: `Could not be produced: ${message}` });
    }
  }

  return { generated, failed };
}

/**
 * Marks a document as uploaded to the PM Surya Ghar portal, or clears it.
 *
 * The app does not upload to the portal — there is no API — so this is an
 * honest hand-ticked record of what a person did on another website. It is
 * audit-logged because the stage 7 gate turns on it.
 */
export async function setPortalUploaded(
  projectId: string,
  documentId: string,
  uploaded: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "portal.upload");

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc || doc.projectId !== projectId || doc.deletedAt) return { ok: false, error: "No such document." };

  await db
    .update(documents)
    .set({
      portalUploadedAt: uploaded ? new Date() : null,
      ...(uploaded ? { status: "UPLOADED_TO_PORTAL" as const } : {}),
    })
    .where(eq(documents.id, documentId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: uploaded ? "portal.upload.mark" : "portal.upload.unmark",
    entityType: "document",
    entityId: documentId,
    projectId,
    after: { docType: doc.docType, uploaded },
  });

  revalidatePath(`/projects/${projectId}/stage-7`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** True if a yyyy-mm-dd string is a real date after today. */
function isFutureDate(v: string): boolean {
  if (!v.trim()) return false;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
}

/**
 * Records the three dates the DISCOM fills in at inspection.
 *
 * Commissioning is deliberately exempt — the net meter fitting, and so the
 * commissioning date, is routinely booked ahead of the day it happens. Joint
 * inspection and the performance check are logged after the fact.
 */
export async function saveInspectionDates(
  projectId: string,
  input: { commissioningDate: string; jointInspectionDate: string; performanceCheckDate: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "document.generate");

  if (isFutureDate(input.jointInspectionDate)) {
    return { ok: false, error: "The joint inspection date cannot be after today." };
  }
  if (isFutureDate(input.performanceCheckDate)) {
    return { ok: false, error: "The performance check date cannot be after today." };
  }

  const day = (v: string) => (v.trim() ? new Date(v) : null);
  const set = {
    commissioningDate: day(input.commissioningDate),
    jointInspectionDate: day(input.jointInspectionDate),
    performanceCheckDate: day(input.performanceCheckDate),
  };

  await db
    .insert(externalRefs)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: externalRefs.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "portal.refs.dates",
    entityType: "external_refs",
    entityId: projectId,
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/stage-7`);
  revalidatePath(`/projects/${projectId}/stage-8`);
  return { ok: true };
}

/** The four module procurement fields the DCR undertaking names. */
export async function saveProcurement(
  projectId: string,
  input: {
    purchaseOrderNo: string;
    purchaseOrderDate: string;
    cellManufacturer: string;
    cellGstInvoiceNo: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "installation.write");

  if (isFutureDate(input.purchaseOrderDate)) {
    return { ok: false, error: "The purchase order date cannot be after today." };
  }

  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  const set = {
    purchaseOrderNo: blank(input.purchaseOrderNo),
    purchaseOrderDate: blank(input.purchaseOrderDate),
    cellManufacturer: blank(input.cellManufacturer),
    cellGstInvoiceNo: blank(input.cellGstInvoiceNo),
    updatedAt: new Date(),
  };

  await db
    .insert(installations)
    .values({ projectId, ...set })
    .onConflictDoUpdate({ target: installations.projectId, set });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "installation.procurement",
    entityType: "installation",
    entityId: projectId,
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/stage-7`);
  return { ok: true };
}
