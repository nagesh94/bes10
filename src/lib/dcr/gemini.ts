import { callGeminiJson, type GeminiPart } from "@/lib/gemini/call";
import { EMPTY_FIELDS, SCALAR_KEYS, normaliseSerial, type DcrFields } from "./fields";

/**
 * Maps a DCR certificate onto `DcrFields` with Gemini.
 *
 * `responseSchema` pins the shape, so what comes back is always the same keys;
 * whether the *values* are right is what `mergeExtraction` checks against the
 * certificate's own text. The REST call and its model fallbacks live in
 * `callGeminiJson`, shared with GST bills.
 *
 * Two inputs: the extracted text when the PDF has a text layer (cheap, and
 * the usual case for NISE certificates), or the PDF itself when it is a scan.
 */

const STRING = { type: "STRING" } as const;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    ...Object.fromEntries(SCALAR_KEYS.map((k) => [k, STRING])),
    chain: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { date: STRING, event: STRING, party: STRING },
        required: ["date", "event", "party"],
      },
    },
    serials: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { serialNo: STRING, wattPeak: STRING },
        required: ["serialNo", "wattPeak"],
      },
    },
  },
  required: [...SCALAR_KEYS, "chain", "serials"],
};

const INSTRUCTIONS = `You extract data from an Indian solar DCR (Domestic Content Requirement) certificate issued on the NISE portal.
Return JSON matching the schema. Rules:
- Copy values exactly as printed. Never invent a value; use "" when a field is not on the certificate.
- Dates as YYYY-MM-DD.
- certificateNo is the number after "DCR Certificate Number" without the bracketed type; certType is the bracketed text (e.g. B2B).
- supplier* is the company that certifies the sale ("We, <name>, Company Registered as ..."). issuedTo* is the addressee after "To".
- purchaseOrderNo is after "Purchase Order #". invoiceRef/invoiceDate come from the "Invoice / E-Way Ref" table.
- wattPeak, efficiency, quantity, totalKw are plain numbers as text, no units.
- moduleDescription is the line describing the module under the model number.
- chain lists every dated step of the chain of custody in order; event is the action (e.g. "DCR Claimed"), party the company after the dash.
- serials lists every panel serial number with its Wp, in printed order.`;

export type GeminiResult = { ok: true; fields: DcrFields } | { ok: false; error: string };

export { geminiConfigured } from "@/lib/gemini/call";

export async function extractWithGemini(
  input: { text: string } | { pdf: Buffer },
): Promise<GeminiResult> {
  const parts: GeminiPart[] =
    "text" in input
      ? [{ text: `${INSTRUCTIONS}\n\nCertificate text:\n"""\n${input.text}\n"""` }]
      : [
          { text: INSTRUCTIONS },
          { inlineData: { mimeType: "application/pdf", data: input.pdf.toString("base64") } },
        ];

  const r = await callGeminiJson(parts, RESPONSE_SCHEMA);
  if (!r.ok) return r;
  const parsed = (r.json ?? {}) as Partial<DcrFields>;
  return { ok: true, fields: coerce(parsed) };
}

/** Whatever came back, forced into the exact shape with strings throughout. */
function coerce(p: Partial<DcrFields>): DcrFields {
  const out: DcrFields = { ...EMPTY_FIELDS, chain: [], serials: [] };
  for (const k of SCALAR_KEYS) {
    const v = p[k];
    out[k] = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  }
  out.chain = Array.isArray(p.chain)
    ? p.chain.map((s) => ({
        date: s?.date ? String(s.date) : null,
        event: String(s?.event ?? "").trim(),
        party: s?.party ? String(s.party).trim() : null,
      }))
    : [];
  out.serials = Array.isArray(p.serials)
    ? p.serials
        .filter((s) => s?.serialNo)
        .map((s) => ({ serialNo: normaliseSerial(String(s.serialNo)), wattPeak: String(s.wattPeak ?? "") }))
    : [];
  return out;
}
