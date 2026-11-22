"use server";

import { and, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { companyBranches, gstBillItems, gstBills, projects, suppliers } from "@/lib/db/schema";
import { looksScanned, pdfText } from "@/lib/dcr/extract-text";
import { normaliseId } from "@/lib/dcr/fields";
import { geminiConfigured } from "@/lib/gemini/call";
import { checkBill, isComplete, type BillIssue } from "@/lib/gst/check";
import { DOC_TYPES, ITEM_KINDS, type Direction, type GstBillFields } from "@/lib/gst/fields";
import { extractBillWithGemini } from "@/lib/gst/gemini";
import { mergeBill, type GstConflict, type GstMethod } from "@/lib/gst/merge";
import { parseGstText } from "@/lib/gst/parse";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { deleteDocumentObject, putDocument } from "@/lib/storage/operations";

/**
 * GST bills: read an uploaded bill, review it, save it.
 *
 * Behind `money.write` throughout — a bill is money data. Reading saves
 * nothing: the file stays in the browser and is sent again with the reviewed
 * fields, so an abandoned review leaves nothing behind (as DCR uploads do).
 */

const MAX_BYTES = 12 * 1024 * 1024;

/** A generated PDF is read as text; a scan or a phone photo goes to Gemini. */
const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function readFile(form: FormData): { file: File; mimeType: string } | string {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose the bill — a PDF or a photo.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = FILE_TYPES[ext];
  if (!mimeType) return "The bill must be a PDF, JPG, PNG or WEBP.";
  if (file.size > MAX_BYTES) return "That file is over 12 MB.";
  return { file, mimeType };
}

async function ourGstins(): Promise<string[]> {
  const rows = await db
    .select({ gstin: companyBranches.gstin })
    .from(companyBranches)
    .where(isNotNull(companyBranches.gstin));
  return rows.map((r) => normaliseId(r.gstin!)).filter(Boolean);
}

/** Indian financial year of a yyyy-mm-dd date: "2026-27" for 2026-11-06. */
function fyOf(iso: string): [string, string] {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return [`${start}-04-01`, `${start + 1}-03-31`];
}

/**
 * The bill already stored, if any: same IRN, or the same party's invoice
 * number within the same financial year (numbers restart every April).
 */
async function findDuplicate(
  opts: { irn: string; invoiceNo: string; invoiceDate: string; partyGstin: string; supplierId: number | null; direction: Direction },
  exceptId?: number,
) {
  const sameParty = opts.supplierId
    ? eq(gstBills.supplierId, opts.supplierId)
    : opts.partyGstin
      ? eq(gstBills.partyGstin, opts.partyGstin)
      : undefined;
  const conds = [];
  if (opts.irn) conds.push(eq(gstBills.irn, opts.irn));
  if (opts.invoiceNo && opts.invoiceDate && sameParty) {
    const [from, to] = fyOf(opts.invoiceDate);
    conds.push(
      and(
        eq(gstBills.direction, opts.direction),
        sameParty,
        sql`lower(${gstBills.invoiceNo}) = ${opts.invoiceNo.trim().toLowerCase()}`,
        sql`${gstBills.invoiceDate} between ${from} and ${to}`,
      ),
    );
  }
  if (!conds.length) return null;
  const [row] = await db
    .select({ id: gstBills.id, invoiceNo: gstBills.invoiceNo, invoiceDate: gstBills.invoiceDate })
    .from(gstBills)
    .where(and(isNull(gstBills.deletedAt), or(...conds), exceptId === undefined ? undefined : ne(gstBills.id, exceptId)))
    .limit(1);
  return row ?? null;
}

export type ExtractGstResult =
  | {
      ok: true;
      fields: GstBillFields;
      method: GstMethod;
      conflicts: GstConflict[];
      unverified: string[];
      itemsFrom: "parser" | "llm";
      issues: BillIssue[];
      /** Why the model was not used, when it was not needed or not available. */
      llmNote: string | null;
      direction: Direction;
      supplierId: number | null;
      ourGstins: string[];
      duplicateOf: { id: number; invoiceNo: string; invoiceDate: string } | null;
    }
  | { ok: false; error: string };

export async function extractGstBill(form: FormData): Promise<ExtractGstResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const read = readFile(form);
  if (typeof read === "string") return { ok: false, error: read };
  const bytes = Buffer.from(await read.file.arrayBuffer());

  const isPdf = read.mimeType === "application/pdf";
  const text = isPdf ? await pdfText(bytes) : "";
  const scanned = !isPdf || looksScanned(text);
  const parsed = parseGstText(scanned ? "" : text);

  // A bill the parser read completely, whose numbers all agree, needs no
  // second opinion: the arithmetic has already checked every figure.
  let llm: GstBillFields | null = null;
  let llmNote: string | null = null;
  if (!scanned && isComplete(parsed)) {
    llmNote = null;
  } else if (!geminiConfigured()) {
    llmNote = "GEMINI_API_KEY is not set, so only the text parser was used.";
  } else {
    const r = await extractBillWithGemini(scanned ? { file: bytes, mimeType: read.mimeType } : { text });
    if (r.ok) llm = r.fields;
    else llmNote = `${r.error} The text parser's result is shown instead.`;
  }

  if (scanned && !llm) {
    return {
      ok: false,
      error: `This file has no readable text (a scan or a photo), and Gemini could not read it. ${llmNote ?? ""}`.trim(),
    };
  }

  const merged = mergeBill(parsed, llm, scanned ? "" : text);
  const f = merged.fields;
  const ours = await ourGstins();
  const direction: Direction = f.sellerGstin && ours.includes(normaliseId(f.sellerGstin)) ? "sales" : "purchase";

  const [supplier] =
    direction === "purchase" && f.sellerGstin
      ? await db
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.gstin, normaliseId(f.sellerGstin)))
          .limit(1)
      : [];

  const partyGstin = normaliseId(direction === "purchase" ? f.sellerGstin : f.buyerGstin);
  const duplicateOf = await findDuplicate({
    irn: f.irn,
    invoiceNo: f.invoiceNo,
    invoiceDate: f.invoiceDate,
    partyGstin,
    supplierId: supplier?.id ?? null,
    direction,
  });

  return {
    ok: true,
    fields: f,
    method: merged.method,
    conflicts: merged.conflicts,
    unverified: merged.unverified,
    itemsFrom: merged.itemsFrom,
    issues: checkBill(f, { ourGstins: ours, direction }),
    llmNote,
    direction,
    supplierId: supplier?.id ?? null,
    ourGstins: ours,
    duplicateOf,
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
/** A signed amount; empty is zero. */
const amount = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return 0;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Number" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });
const optNumber = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Number" });
      return z.NEVER;
    }
    return n;
  });
const gstinField = z
  .string()
  .trim()
  .transform((v) => normaliseId(v))
  .refine((v) => v === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v), "Not a valid GSTIN")
  .transform((v) => v || null);

const itemSchema = z.object({
  kind: z.enum(ITEM_KINDS),
  description: z.string().trim().min(1, "Every line needs a description"),
  hsnSac: optText,
  quantity: optNumber,
  unit: optText,
  rate: optNumber,
  taxableValue: amount,
  gstRate: optNumber,
});

const saveSchema = z.object({
  direction: z.enum(["purchase", "sales"]),
  docType: z.enum(DOC_TYPES),
  invoiceNo: z.string().trim().min(1, "Invoice number is required"),
  invoiceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Invoice date is required"),
  supplierId: z.union([z.number().int().positive(), z.null()]),
  sellerName: z.string().trim(),
  sellerGstin: gstinField,
  buyerName: z.string().trim(),
  buyerGstin: gstinField,
  placeOfSupply: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{2}$/.test(v), "Two-digit state code")
    .transform((v) => v || null),
  reverseCharge: z.enum(["yes", "no"]),
  irn: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .refine((v) => v === "" || /^[0-9a-f]{64}$/.test(v), "An IRN is 64 characters")
    .transform((v) => v || null),
  ackNo: optText,
  ackDate: isoDate,
  ewayBillNo: optText,
  buyerOrderNo: optText,
  refInvoiceNo: optText,
  refInvoiceDate: isoDate,
  projectId: optText,
  taxableValue: amount,
  cgst: amount,
  sgst: amount,
  igst: amount,
  cess: amount,
  tcs: amount,
  roundOff: amount,
  total: amount,
  itcEligible: z.boolean(),
  notes: optText,
  items: z.array(itemSchema).min(1, "Add at least one line"),
  extraction: z
    .object({
      method: z.string(),
      conflicts: z.array(z.unknown()).default([]),
      unverified: z.array(z.string()).default([]),
      original: z.unknown().optional(),
    })
    .optional(),
});

export type GstSaveInput = z.input<typeof saveSchema>;

export type SaveGstResult =
  | { ok: true; id: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function saveGstBill(form: FormData): Promise<SaveGstResult> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const read = readFile(form);
  if (typeof read === "string") return { ok: false, error: read };

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
    const itemError = parsed.error.issues.find((i) => i.path[0] === "items")?.message;
    const first = Object.values(fieldErrors)[0]?.[0] ?? itemError;
    return { ok: false, error: first ?? "Please check the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;
  const purchase = input.direction === "purchase";

  let partyName = purchase ? input.sellerName : input.buyerName;
  if (purchase) {
    if (!input.supplierId) {
      return { ok: false, error: "Pick or add the supplier.", fieldErrors: { supplierId: ["Required"] } };
    }
    const [supplier] = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .limit(1);
    if (!supplier) return { ok: false, error: "That supplier no longer exists.", fieldErrors: { supplierId: ["Pick again"] } };
    partyName ||= supplier.name;
  }
  if (!partyName) {
    return {
      ok: false,
      error: purchase ? "The seller's name is required." : "The buyer's name is required.",
      fieldErrors: { [purchase ? "sellerName" : "buyerName"]: ["Required"] },
    };
  }

  if (input.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!p) return { ok: false, error: "That project no longer exists.", fieldErrors: { projectId: ["Pick again"] } };
  }

  const partyGstin = purchase ? input.sellerGstin : input.buyerGstin;
  const duplicate = await findDuplicate({
    irn: input.irn ?? "",
    invoiceNo: input.invoiceNo,
    invoiceDate: input.invoiceDate,
    partyGstin: partyGstin ?? "",
    supplierId: purchase ? input.supplierId : null,
    direction: input.direction,
  });
  if (duplicate) {
    return {
      ok: false,
      error: `Invoice ${duplicate.invoiceNo} of ${duplicate.invoiceDate} is already stored. Delete it first to replace it.`,
      fieldErrors: { invoiceNo: ["Already stored"] },
    };
  }

  // Tax per line from its rate, on the head the bill uses. The bill's own
  // totals stay as printed; these are for reports by HSN and rate.
  const interState = input.igst > 0;
  const items = input.items.map((i, sortOrder) => {
    const tax = i.gstRate ? Math.round(i.taxableValue * i.gstRate) / 100 : 0;
    const half = Math.round((tax / 2) * 100) / 100;
    return {
      sortOrder,
      kind: i.kind,
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: i.quantity === null ? null : String(i.quantity),
      unit: i.unit,
      rate: i.rate === null ? null : String(i.rate),
      taxableValue: i.taxableValue.toFixed(2),
      gstRate: i.gstRate === null ? null : String(i.gstRate),
      cgst: (interState ? 0 : half).toFixed(2),
      sgst: (interState ? 0 : half).toFixed(2),
      igst: (interState ? tax : 0).toFixed(2),
      cess: "0.00",
    };
  });

  const file = read.file;
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "bill.pdf";
  const s3Key = `gst/${input.invoiceDate.slice(0, 7)}/${Date.now()}-${safeName}`;
  await putDocument(s3Key, Buffer.from(await file.arrayBuffer()), read.mimeType);

  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(gstBills)
        .values({
          direction: input.direction,
          docType: input.docType,
          invoiceNo: input.invoiceNo,
          invoiceDate: input.invoiceDate,
          supplierId: purchase ? input.supplierId : null,
          partyName,
          partyGstin,
          ourGstin: purchase ? input.buyerGstin : input.sellerGstin,
          placeOfSupply: input.placeOfSupply,
          reverseCharge: input.reverseCharge === "yes",
          irn: input.irn,
          ackNo: input.ackNo,
          ackDate: input.ackDate,
          ewayBillNo: input.ewayBillNo,
          buyerOrderNo: input.buyerOrderNo,
          refInvoiceNo: input.refInvoiceNo,
          refInvoiceDate: input.refInvoiceDate,
          projectId: input.projectId,
          taxableValue: input.taxableValue.toFixed(2),
          cgst: input.cgst.toFixed(2),
          sgst: input.sgst.toFixed(2),
          igst: input.igst.toFixed(2),
          cess: input.cess.toFixed(2),
          tcs: input.tcs.toFixed(2),
          roundOff: input.roundOff.toFixed(2),
          total: input.total.toFixed(2),
          itcEligible: input.docType === "bill_of_supply" ? false : input.itcEligible,
          notes: input.notes,
          fileName: file.name,
          s3Key,
          contentType: read.mimeType,
          sizeBytes: file.size,
          extracted: input.extraction ?? null,
          extractionMethod: input.extraction?.method ?? null,
          uploadedBy: actor!.id,
        })
        .returning({ id: gstBills.id });
      await tx.insert(gstBillItems).values(items.map((i) => ({ ...i, billId: row!.id })));
      return row!.id;
    });
  } catch (err) {
    await deleteDocumentObject(s3Key);
    if (/unique|duplicate/i.test((err as Error).message ?? "")) {
      return { ok: false, error: "A bill with this IRN was saved by someone else just now." };
    }
    throw err;
  }

  await writeAudit({
    actorId: actor!.id,
    action: "gst.bill.add",
    entityType: "gst_bill",
    entityId: String(id),
    projectId: input.projectId,
    after: {
      direction: input.direction,
      invoiceNo: input.invoiceNo,
      party: partyName,
      total: input.total,
      method: input.extraction?.method ?? "manual",
    },
  });

  revalidatePath("/finance", "layout");
  return { ok: true, id };
}

export async function deleteGstBill(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "money.write");

  const [row] = await db
    .select()
    .from(gstBills)
    .where(and(eq(gstBills.id, id), isNull(gstBills.deletedAt)))
    .limit(1);
  if (!row) return { ok: false, error: "That bill is already gone." };

  // Kept for the audit trail, like expenses; the file stays with it.
  await db.update(gstBills).set({ deletedAt: new Date() }).where(eq(gstBills.id, id));
  await writeAudit({
    actorId: actor!.id,
    action: "gst.bill.delete",
    entityType: "gst_bill",
    entityId: String(id),
    projectId: row.projectId,
    before: { invoiceNo: row.invoiceNo, invoiceDate: row.invoiceDate, party: row.partyName, total: row.total },
  });

  revalidatePath("/finance", "layout");
  return { ok: true };
}
