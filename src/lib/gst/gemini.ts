import { callGeminiJson, type GeminiPart } from "@/lib/gemini/call";
import { toIsoDate } from "@/lib/dcr/fields";
import {
  DOC_TYPES,
  EMPTY_BILL,
  ITEM_KINDS,
  MONEY_KEYS,
  SCALAR_KEYS,
  kindForCode,
  stateCode,
  toAmount,
  type GstBillFields,
  type GstItemFields,
} from "./fields";

/**
 * Maps any GST bill onto `GstBillFields` with Gemini.
 *
 * Used when the text parser could not read a bill completely: a scan, a
 * phone photo, or a layout it does not know. The result is checked by the
 * same arithmetic as the parser's (`checkBill`), and literal values are
 * cross-checked against the PDF text where there is one (`mergeBill`).
 */

const STRING = { type: "STRING" } as const;
const ITEM_KEYS = ["kind", "description", "hsnSac", "quantity", "unit", "rate", "taxableValue", "gstRate"] as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ...Object.fromEntries(SCALAR_KEYS.map((k) => [k, STRING])),
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: Object.fromEntries(ITEM_KEYS.map((k) => [k, STRING])),
        required: [...ITEM_KEYS],
      },
    },
  },
  required: [...SCALAR_KEYS, "items"],
};

const INSTRUCTIONS = `You extract data from an Indian GST document: a tax invoice, bill of supply, credit note or debit note.
Return JSON matching the schema. Rules:
- Copy values exactly as printed. Never invent a value; use "" when it is not on the document.
- docType is one of: ${DOC_TYPES.join(", ")}.
- Dates as YYYY-MM-DD. Amounts and quantities as plain numbers: no commas, no currency symbol, no units.
- seller* is the party issuing the document (the letterhead). buyer* is "Bill to" / "Buyer" / "Details of receiver".
- sellerName without any financial-year suffix such as "- 2026-2027 -".
- placeOfSupply is the two-digit GST state code (e.g. 23 for Madhya Pradesh). If not printed, use the buyer's state code.
- reverseCharge is "yes" or "no".
- irn is the 64-character e-invoice IRN, joined if it wraps across lines.
- refInvoiceNo/refInvoiceDate: for a credit or debit note, the original invoice it refers to.
- taxableValue is the total before tax. cgst, sgst (include UTGST), igst, cess, tcs are bill totals. roundOff is signed (negative when deducted). total is the grand total payable.
- items lists every line in printed order, then every extra line added before tax (freight, packing, loading) with kind "charge", and every discount with kind "discount" and a negative taxableValue.
- item kind is one of: ${ITEM_KINDS.join(", ")}. Use "service" for SAC codes starting with 99.
- item taxableValue is the line amount before tax. gstRate is the total GST percent for the line (18 for 9% CGST + 9% SGST), read from the line or the HSN summary table.`;

export type GstGeminiResult = { ok: true; fields: GstBillFields } | { ok: false; error: string };

export async function extractBillWithGemini(
  input: { text: string } | { file: Buffer; mimeType: string },
): Promise<GstGeminiResult> {
  const parts: GeminiPart[] =
    "text" in input
      ? [{ text: `${INSTRUCTIONS}\n\nDocument text:\n"""\n${input.text}\n"""` }]
      : [{ text: INSTRUCTIONS }, { inlineData: { mimeType: input.mimeType, data: input.file.toString("base64") } }];

  const r = await callGeminiJson(parts, RESPONSE_SCHEMA);
  if (!r.ok) return r;
  return { ok: true, fields: coerce((r.json ?? {}) as Record<string, unknown>) };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const numStr = (v: unknown) => {
  const n = toAmount(str(v));
  return Number.isFinite(n) ? String(n) : "";
};

/** Whatever came back, forced into the exact shape with clean strings. */
function coerce(p: Record<string, unknown>): GstBillFields {
  const out: GstBillFields = { ...EMPTY_BILL, items: [] };
  for (const k of SCALAR_KEYS) out[k] = str(p[k]);

  for (const k of MONEY_KEYS) out[k] = numStr(out[k]);
  for (const k of ["invoiceDate", "ackDate", "refInvoiceDate"] as const) out[k] = out[k] ? toIsoDate(out[k]) : "";
  for (const k of ["sellerGstin", "buyerGstin"] as const) out[k] = out[k].replace(/\s+/g, "").toUpperCase();
  out.placeOfSupply = out.placeOfSupply ? stateCode(out.placeOfSupply) : "";
  out.reverseCharge = /^y/i.test(out.reverseCharge) ? "yes" : "no";
  out.irn = out.irn.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (out.irn.length !== 64) out.irn = "";
  if (!(DOC_TYPES as readonly string[]).includes(out.docType)) out.docType = "tax_invoice";

  const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
  out.items = items
    .map((i): GstItemFields => {
      const hsnSac = str(i?.hsnSac).replace(/\s+/g, "");
      const kind = str(i?.kind);
      return {
        kind: (ITEM_KINDS as readonly string[]).includes(kind) ? kind : kindForCode(hsnSac),
        description: str(i?.description),
        hsnSac,
        quantity: numStr(i?.quantity),
        unit: str(i?.unit),
        rate: numStr(i?.rate),
        taxableValue: numStr(i?.taxableValue),
        gstRate: numStr(i?.gstRate),
      };
    })
    .filter((i) => i.description || i.taxableValue);
  return out;
}
