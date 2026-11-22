"use server";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { companyBranches, dcrCertificates, dcrSerials, projects, suppliers } from "@/lib/db/schema";
import { looksScanned, pdfText } from "@/lib/dcr/extract-text";
import { normaliseId, normaliseSerial, type DcrFields } from "@/lib/dcr/fields";
import { extractWithGemini, geminiConfigured } from "@/lib/dcr/gemini";
import {
  checkConsistency,
  mergeExtraction,
  type ConsistencyIssue,
  type ExtractionMethod,
  type FieldConflict,
} from "@/lib/dcr/merge";
import { checkSerials, projectsUsingSerials, syncProjectDcr, type SerialCheck } from "@/lib/dcr/matching";
import { parseDcrText } from "@/lib/dcr/parse";
import { installerIdsFor } from "@/lib/projects/crew";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { deleteDocumentObject, putDocument } from "@/lib/storage/operations";

const MAX_BYTES = 12 * 1024 * 1024;

export type SupplierOption = { id: number; name: string; gstin: string | null };

export type ExtractResult =
  | {
      ok: true;
      fields: DcrFields;
      method: ExtractionMethod;
      conflicts: FieldConflict[];
      unverified: string[];
      droppedSerials: string[];
      issues: ConsistencyIssue[];
      /** Why the model was not used, when it was not. */
      llmNote: string | null;
      supplierId: number | null;
      /** Already stored under this certificate number. */
      duplicateOf: { id: number; certificateNo: string } | null;
      /** Serials already on another stored certificate. */
      serialClashes: { serialNo: string; certificateNo: string }[];
    }
  | { ok: false; error: string };

function readPdf(form: FormData): File | string {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose the certificate PDF.";
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return "The certificate must be a PDF.";
  }
  if (file.size > MAX_BYTES) return "That PDF is over 12 MB.";
  return file;
}

async function ourGstins(): Promise<string[]> {
  const rows = await db
    .select({ gstin: companyBranches.gstin })
    .from(companyBranches)
    .where(isNotNull(companyBranches.gstin));
  return rows.map((r) => r.gstin!).filter(Boolean);
}

async function clashesFor(serials: string[], exceptCertificateId?: number) {
  const wanted = [...new Set(serials.map(normaliseSerial))];
  if (wanted.length === 0) return [];
  return db
    .select({ serialNo: dcrSerials.serialNo, certificateNo: dcrCertificates.certificateNo })
    .from(dcrSerials)
    .innerJoin(dcrCertificates, eq(dcrSerials.certificateId, dcrCertificates.id))
    .where(
      and(
        inArray(dcrSerials.serialNo, wanted),
        exceptCertificateId === undefined ? undefined : ne(dcrCertificates.id, exceptCertificateId),
      ),
    );
}

/**
 * Reads an uploaded certificate and returns its fields for review.
 *
 * Saves nothing: the file stays in the browser and is sent again with the
 * reviewed fields, so an upload that is abandoned leaves nothing behind.
 */
export async function extractDcr(form: FormData): Promise<ExtractResult> {
  const actor = await getActor();
  assertCan(actor, "document.upload");

  const file = readPdf(form);
  if (typeof file === "string") return { ok: false, error: file };
  const bytes = Buffer.from(await file.arrayBuffer());

  const text = await pdfText(bytes);
  const scanned = looksScanned(text);
  const parsed = parseDcrText(scanned ? "" : text);

  let llmNote: string | null = null;
  let llm: DcrFields | null = null;
  if (!geminiConfigured()) {
    llmNote = "GEMINI_API_KEY is not set, so only the text parser was used.";
  } else {
    const r = await extractWithGemini(scanned ? { pdf: bytes } : { text });
    if (r.ok) llm = r.fields;
    else llmNote = `${r.error} The text parser's result is shown instead.`;
  }

  if (scanned && !llm) {
    return {
      ok: false,
      error: `This PDF has no readable text (it looks like a scan), and Gemini could not read it. ${llmNote ?? ""}`.trim(),
    };
  }

  const merged = mergeExtraction(parsed, llm, scanned ? "" : text);
  const f = merged.fields;

  const [supplier] = f.supplierGstin
    ? await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.gstin, normaliseId(f.supplierGstin)))
        .limit(1)
    : [];

  const [duplicate] = f.certificateNo
    ? await db
        .select({ id: dcrCertificates.id, certificateNo: dcrCertificates.certificateNo })
        .from(dcrCertificates)
        .where(eq(dcrCertificates.certificateNo, f.certificateNo.trim()))
        .limit(1)
    : [];

  return {
    ok: true,
    fields: f,
    method: merged.method,
    conflicts: merged.conflicts,
    unverified: merged.unverified,
    droppedSerials: merged.droppedSerials,
    issues: checkConsistency(f, await ourGstins()),
    llmNote,
    supplierId: supplier?.id ?? null,
    duplicateOf: duplicate ?? null,
    serialClashes: await clashesFor(f.serials.map((s) => s.serialNo)),
  };
}

/* ── Saving ──────────────────────────────────────────────────────────── */

const isoDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date")
  .transform((v) => v || null);
const optText = z
  .string()
  .trim()
  .transform((v) => v || null);
const optInt = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Whole number" });
      return z.NEVER;
    }
    return n;
  });
const optDec = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Number" });
      return z.NEVER;
    }
    return String(n);
  });

const saveSchema = z.object({
  supplierId: z.coerce.number().int().positive({ message: "Pick the supplier" }),
  certificateNo: z.string().trim().min(4, "Certificate number is required"),
  revision: z.string().trim().default("00"),
  certType: optText,
  certDate: isoDate,
  issuedToName: optText,
  issuedToGstin: optText,
  purchaseOrderNo: optText,
  purchaseOrderDate: isoDate,
  invoiceRef: optText,
  invoiceDate: isoDate,
  cellManufacturer: optText,
  cellManufacturerAddress: optText,
  moduleManufacturer: optText,
  moduleManufacturerAddress: optText,
  modelNo: optText,
  moduleDescription: optText,
  wattPeak: optInt,
  efficiency: optDec,
  technology: optText,
  cellModel: optText,
  quantity: optInt,
  totalKw: optDec,
  notes: optText,
  chain: z
    .array(z.object({ date: z.string().nullable(), event: z.string(), party: z.string().nullable() }))
    .default([]),
  serials: z
    .array(z.object({ serialNo: z.string(), wattPeak: z.string() }))
    .transform((list) =>
      list
        .map((s) => ({ serialNo: normaliseSerial(s.serialNo), wattPeak: s.wattPeak.trim() }))
        .filter((s) => s.serialNo),
    )
    .refine((list) => list.length > 0, "At least one panel serial is required"),
  extraction: z
    .object({
      method: z.string(),
      conflicts: z.array(z.unknown()).default([]),
      unverified: z.array(z.string()).default([]),
      original: z.unknown().optional(),
    })
    .optional(),
});

export type SaveDcrResult =
  | { ok: true; id: number; projectsUpdated: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveDcrCertificate(form: FormData): Promise<SaveDcrResult> {
  const actor = await getActor();
  assertCan(actor, "document.upload");

  const file = readPdf(form);
  if (typeof file === "string") return { ok: false, error: file };

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("data") ?? ""));
  } catch {
    return { ok: false, error: "The form data could not be read." };
  }

  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const fieldErrors = Object.fromEntries(Object.entries(fe).filter(([, v]) => v?.length)) as Record<string, string[]>;
    const first = Object.values(fieldErrors)[0]?.[0];
    return { ok: false, error: first ?? "Please check the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  const dupSerials = input.serials.filter((s, i) => input.serials.findIndex((o) => o.serialNo === s.serialNo) !== i);
  if (dupSerials.length) {
    return { ok: false, error: `Serial ${dupSerials[0]!.serialNo} is listed twice.` };
  }

  const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
  if (!supplier) return { ok: false, error: "That supplier no longer exists.", fieldErrors: { supplierId: ["Pick again"] } };

  const [existing] = await db
    .select({ id: dcrCertificates.id })
    .from(dcrCertificates)
    .where(eq(dcrCertificates.certificateNo, input.certificateNo))
    .limit(1);
  if (existing) {
    return {
      ok: false,
      error: `Certificate ${input.certificateNo} is already stored. Delete it first to replace it with a new revision.`,
      fieldErrors: { certificateNo: ["Already stored"] },
    };
  }

  const clashes = await clashesFor(input.serials.map((s) => s.serialNo));
  if (clashes.length) {
    return {
      ok: false,
      error: `${clashes.length} serial${clashes.length === 1 ? " is" : "s are"} already on another certificate: ${clashes
        .slice(0, 3)
        .map((c) => `${c.serialNo} (${c.certificateNo})`)
        .join(", ")}${clashes.length > 3 ? "…" : ""}.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "dcr.pdf";
  const s3Key = `dcr/${input.certificateNo.replace(/[^0-9A-Za-z-]/g, "")}/${Date.now()}-${safeName}`;
  await putDocument(s3Key, bytes, "application/pdf");

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dcrCertificates)
        .values({
          certificateNo: input.certificateNo,
          revision: input.revision || "00",
          certType: input.certType,
          certDate: input.certDate,
          supplierId: input.supplierId,
          issuedToName: input.issuedToName,
          issuedToGstin: input.issuedToGstin ? normaliseId(input.issuedToGstin) : null,
          purchaseOrderNo: input.purchaseOrderNo,
          purchaseOrderDate: input.purchaseOrderDate,
          invoiceRef: input.invoiceRef,
          invoiceDate: input.invoiceDate,
          cellManufacturer: input.cellManufacturer,
          cellManufacturerAddress: input.cellManufacturerAddress,
          moduleManufacturer: input.moduleManufacturer,
          moduleManufacturerAddress: input.moduleManufacturerAddress,
          modelNo: input.modelNo,
          moduleDescription: input.moduleDescription,
          wattPeak: input.wattPeak,
          efficiency: input.efficiency,
          technology: input.technology,
          cellModel: input.cellModel,
          quantity: input.quantity,
          totalKw: input.totalKw,
          chain: input.chain,
          fileName: file.name,
          s3Key,
          sizeBytes: file.size,
          extracted: input.extraction ?? null,
          extractionMethod: input.extraction?.method ?? null,
          notes: input.notes,
          uploadedBy: actor!.id,
        })
        .returning({ id: dcrCertificates.id });

      await tx.insert(dcrSerials).values(
        input.serials.map((s, i) => ({
          certificateId: row!.id,
          serialNo: s.serialNo,
          wattPeak: s.wattPeak ? Number(s.wattPeak) || null : input.wattPeak,
          sortOrder: i,
        })),
      );
      return row!.id;
    });
  } catch (err) {
    await deleteDocumentObject(s3Key);
    const msg = (err as Error).message ?? "";
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, error: "This certificate or one of its serials was saved by someone else just now." };
    }
    throw err;
  }

  await writeAudit({
    actorId: actor!.id,
    action: "dcr.certificate.add",
    entityType: "dcr_certificate",
    entityId: String(id),
    after: {
      certificateNo: input.certificateNo,
      supplierId: input.supplierId,
      serials: input.serials.length,
      method: input.extraction?.method ?? "manual",
    },
  });

  // Projects that already listed these serials now match: clear their flags
  // and fill their DCR undertaking fields.
  const affected = await projectsUsingSerials(input.serials.map((s) => s.serialNo));
  for (const projectId of affected) await syncProjectDcr(projectId);

  revalidatePath("/dcr");
  return { ok: true, id, projectsUpdated: affected.length };
}

export async function deleteDcrCertificate(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "document.delete");

  const [cert] = await db.select().from(dcrCertificates).where(eq(dcrCertificates.id, id)).limit(1);
  if (!cert) return { ok: false, error: "No such certificate." };

  const serials = await db
    .select({ serialNo: dcrSerials.serialNo })
    .from(dcrSerials)
    .where(eq(dcrSerials.certificateId, id));
  const affected = await projectsUsingSerials(serials.map((s) => s.serialNo));

  await db.delete(dcrCertificates).where(eq(dcrCertificates.id, id));
  if (cert.s3Key) await deleteDocumentObject(cert.s3Key);

  await writeAudit({
    actorId: actor!.id,
    action: "dcr.certificate.delete",
    entityType: "dcr_certificate",
    entityId: String(id),
    before: { certificateNo: cert.certificateNo, serials: serials.length, projects: affected },
  });

  for (const projectId of affected) await syncProjectDcr(projectId);

  revalidatePath("/dcr");
  return { ok: true };
}

/* ── Suppliers ───────────────────────────────────────────────────────── */

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  gstin: z
    .string()
    .trim()
    .transform((v) => normaliseId(v))
    .refine((v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v), "Not a valid GSTIN")
    .transform((v) => v || null),
  pan: z
    .string()
    .trim()
    .transform((v) => normaliseId(v))
    .refine((v) => v === "" || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "Not a valid PAN")
    .transform((v) => v || null),
  address: optText,
  state: optText,
  pincode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{6}$/.test(v), "6 digits")
    .transform((v) => v || null),
  phone: optText,
  email: optText,
});

export type SupplierInput = z.input<typeof supplierSchema>;

export type SupplierResult =
  | { ok: true; supplier: SupplierOption }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Adds a supplier. Open to whoever may upload a certificate, so a new
 * supplier can be added from the upload form without a trip to admin.
 */
export async function createSupplier(raw: SupplierInput): Promise<SupplierResult> {
  const actor = await getActor();
  assertCan(actor, "document.upload");
  return upsertSupplier(actor!.id, null, raw);
}

export async function updateSupplier(id: number, raw: SupplierInput): Promise<SupplierResult> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");
  return upsertSupplier(actor!.id, id, raw);
}

async function upsertSupplier(actorId: string, id: number | null, raw: SupplierInput): Promise<SupplierResult> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    const fieldErrors = Object.fromEntries(Object.entries(fe).filter(([, v]) => v?.length)) as Record<string, string[]>;
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  if (input.gstin) {
    const [dup] = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.gstin, input.gstin), id === null ? undefined : ne(suppliers.id, id)))
      .limit(1);
    if (dup) {
      return { ok: false, error: `GSTIN already belongs to ${dup.name}.`, fieldErrors: { gstin: ["Already used"] } };
    }
  } else {
    const [dup] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(sql`lower(${suppliers.name}) = ${input.name.toLowerCase()}`, id === null ? undefined : ne(suppliers.id, id)))
      .limit(1);
    if (dup) return { ok: false, error: "A supplier with that name exists.", fieldErrors: { name: ["Already in the list"] } };
  }

  const [row] =
    id === null
      ? await db.insert(suppliers).values(input).returning()
      : await db.update(suppliers).set(input).where(eq(suppliers.id, id)).returning();
  if (!row) return { ok: false, error: "No such supplier." };

  await writeAudit({
    actorId,
    action: id === null ? "supplier.add" : "supplier.update",
    entityType: "supplier",
    entityId: String(row.id),
    after: input,
  });

  revalidatePath("/dcr");
  revalidatePath("/admin/master");
  return { ok: true, supplier: { id: row.id, name: row.name, gstin: row.gstin } };
}

export async function setSupplierActive(id: number, active: boolean): Promise<{ ok: true }> {
  const actor = await getActor();
  assertCan(actor, "admin.masterdata");
  await db.update(suppliers).set({ active }).where(eq(suppliers.id, id));
  await writeAudit({
    actorId: actor!.id,
    action: "supplier.active",
    entityType: "supplier",
    entityId: String(id),
    after: { active },
  });
  revalidatePath("/dcr");
  revalidatePath("/admin/master");
  return { ok: true };
}

/* ── Stage 3 lookups ─────────────────────────────────────────────────── */

/** Live badges for the serial list, before anything is saved. */
export async function lookupPanelSerials(projectId: string, serials: string[]): Promise<SerialCheck[]> {
  const actor = await getActor();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return [];
  assertCan(actor, "installation.write", {
    assignedEmployeeId: project.assignedEmployeeId,
    assignedInstallerIds: await installerIdsFor(projectId),
  });
  const checks = await checkSerials(projectId, serials.slice(0, 500));
  // An installer sees their own jobs only, so another job's customer name
  // is replaced by a neutral label. The status itself still shows.
  if (can(actor, "project.write")) return checks;
  return checks.map((c) => ({
    ...c,
    otherProjects: c.otherProjects.map(() => ({ id: "", label: "another project" })),
  }));
}
