import { GEMINI_API_KEY, GEMINI_FALLBACK_MODELS, GEMINI_MODEL } from "@/lib/env";
import { EMPTY_FIELDS, SCALAR_KEYS, normaliseSerial, type DcrFields } from "./fields";

/**
 * Maps a DCR certificate onto `DcrFields` with Gemini.
 *
 * Called over plain REST rather than through an SDK — one endpoint, one JSON
 * body, and no dependency to keep current. `responseSchema` pins the shape, so
 * what comes back is always the same keys; whether the *values* are right is
 * what `mergeExtraction` checks against the certificate's own text.
 *
 * Two inputs: the extracted text when the PDF has a text layer (cheap, and
 * the usual case for NISE certificates), or the PDF itself when it is a scan.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

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

export function geminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export async function extractWithGemini(
  input: { text: string } | { pdf: Buffer },
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) return { ok: false, error: "GEMINI_API_KEY is not set." };

  const parts =
    "text" in input
      ? [{ text: `${INSTRUCTIONS}\n\nCertificate text:\n"""\n${input.text}\n"""` }]
      : [
          { text: INSTRUCTIONS },
          { inlineData: { mimeType: "application/pdf", data: input.pdf.toString("base64") } },
        ];

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  // 429 and 503 are Gemini saying "busy". A model under load can stay busy for
  // minutes, so after one retry the next model in the list is tried instead of
  // waiting on the same one. Every model listed returned the same fields for
  // the sample certificate.
  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let res: Response | null = null;
  let lastError = "Could not reach Gemini.";
  outer: for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          body,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        res = null;
        lastError = `Could not reach Gemini: ${(err as Error).message}`;
        continue;
      }
      if (res.ok) break outer;
      // A retired or unknown model will not come back on retry; move on.
      if (res.status === 404) continue outer;
      if (res.status !== 429 && res.status !== 503) break outer;
    }
  }
  if (!res) return { ok: false, error: lastError };

  if (!res.ok) {
    // The body names the problem (bad key, quota, unknown model) and never echoes the key.
    const errText = await res.text().catch(() => "");
    const message = /"message"\s*:\s*"([^"]+)"/.exec(errText)?.[1] ?? res.statusText;
    return { ok: false, error: `Gemini answered ${res.status}: ${message}` };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  let parsed: Partial<DcrFields>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Gemini returned something that is not JSON." };
  }

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
