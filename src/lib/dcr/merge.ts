import { SCALAR_KEYS, normaliseSerial, type DcrFields, type DcrScalarKey } from "./fields";

export type ExtractionMethod = "parser" | "parser+llm" | "llm-text" | "llm-pdf";

export interface FieldConflict {
  key: DcrScalarKey;
  parser: string;
  llm: string;
}

export interface MergedExtraction {
  fields: DcrFields;
  method: ExtractionMethod;
  /** Both sources had a value and they disagree. The parser's value is used. */
  conflicts: FieldConflict[];
  /**
   * Values only the model produced that do not appear anywhere in the
   * certificate text — possibly invented. Empty when there is no text to
   * check against (a scan), which `method` makes visible instead.
   */
  unverified: DcrScalarKey[];
  /** Serials the model listed that are not in the text; dropped. */
  droppedSerials: string[];
}

/** Keys whose value is copied verbatim from the certificate, so must appear in its text. */
const LITERAL_KEYS: DcrScalarKey[] = [
  "certificateNo",
  "supplierGstin",
  "supplierPan",
  "issuedToGstin",
  "purchaseOrderNo",
  "invoiceRef",
  "modelNo",
  "cellModel",
];

const NUMERIC_KEYS = new Set<DcrScalarKey>(["wattPeak", "efficiency", "quantity", "totalKw"]);

const squash = (s: string) => s.replace(/[\s,.]+/g, "").toUpperCase();

function same(key: DcrScalarKey, a: string, b: string): boolean {
  if (NUMERIC_KEYS.has(key)) {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < 0.005;
  }
  return squash(a) === squash(b);
}

/**
 * Combines what the parser read with what the model returned.
 *
 * The parser copies text literally, so where it found a value that value
 * wins; the model fills what the parser missed. Every disagreement is
 * reported rather than settled silently, and a model value for a literal
 * field (a GSTIN, a PO number) that cannot be found in the certificate's own
 * text is marked unverified — that is how an invented value gets caught.
 */
export function mergeExtraction(
  parsed: DcrFields,
  llm: DcrFields | null,
  sourceText: string,
): MergedExtraction {
  if (!llm) {
    return { fields: parsed, method: "parser", conflicts: [], unverified: [], droppedSerials: [] };
  }

  const haystack = squash(sourceText);
  const hasText = haystack.length > 200;
  const fields: DcrFields = { ...parsed, chain: parsed.chain, serials: parsed.serials };
  const conflicts: FieldConflict[] = [];
  const unverified: DcrScalarKey[] = [];

  for (const key of SCALAR_KEYS) {
    const p = parsed[key];
    const l = llm[key];
    if (p && l && !same(key, p, l)) conflicts.push({ key, parser: p, llm: l });
    if (!p && l) {
      fields[key] = l;
      if (hasText && LITERAL_KEYS.includes(key) && !haystack.includes(squash(l))) unverified.push(key);
    }
  }

  if (fields.chain.length === 0) fields.chain = llm.chain;

  let droppedSerials: string[] = [];
  if (fields.serials.length === 0) {
    if (hasText) {
      const keep = llm.serials.filter((s) => haystack.includes(normaliseSerial(s.serialNo)));
      droppedSerials = llm.serials.filter((s) => !keep.includes(s)).map((s) => s.serialNo);
      fields.serials = keep;
    } else {
      fields.serials = llm.serials;
    }
  }

  const parserFoundAnything = SCALAR_KEYS.some((k) => parsed[k]) || parsed.serials.length > 0;
  const method: ExtractionMethod = !hasText ? "llm-pdf" : parserFoundAnything ? "parser+llm" : "llm-text";

  return { fields, method, conflicts, unverified, droppedSerials };
}

export interface ConsistencyIssue {
  code: "QTY_SERIALS" | "KW_MISMATCH" | "WP_MISMATCH" | "NOT_ADDRESSED_TO_US" | "DUPLICATE_SERIAL";
  message: string;
}

/**
 * Arithmetic the certificate must agree with itself on. Shown on review and
 * re-checked on save; none of it blocks saving except duplicate serials.
 */
export function checkConsistency(f: DcrFields, ourGstins: string[] = []): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const qty = Number(f.quantity);
  const wp = Number(f.wattPeak);
  const kw = Number(f.totalKw);

  if (f.quantity && Number.isFinite(qty) && qty !== f.serials.length) {
    issues.push({
      code: "QTY_SERIALS",
      message: `Quantity is ${qty} but ${f.serials.length} serial number${f.serials.length === 1 ? "" : "s"} are listed.`,
    });
  }

  if (qty > 0 && wp > 0 && f.totalKw && Number.isFinite(kw)) {
    const expected = (qty * wp) / 1000;
    if (Math.abs(expected - kw) > 0.01) {
      issues.push({
        code: "KW_MISMATCH",
        message: `${qty} × ${wp} Wp = ${expected.toFixed(2)} kW, but the certificate says ${kw.toFixed(2)} kW.`,
      });
    }
  }

  if (wp > 0) {
    const off = f.serials.filter((s) => s.wattPeak && Number(s.wattPeak) !== wp);
    if (off.length) {
      issues.push({
        code: "WP_MISMATCH",
        message: `${off.length} serial${off.length === 1 ? " is" : "s are"} not ${wp} Wp: ${off.map((s) => s.serialNo).join(", ")}.`,
      });
    }
  }

  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const s of f.serials) {
    const n = normaliseSerial(s.serialNo);
    if (seen.has(n)) dups.add(n);
    seen.add(n);
  }
  if (dups.size) {
    issues.push({ code: "DUPLICATE_SERIAL", message: `Listed twice: ${[...dups].join(", ")}.` });
  }

  const ours = ourGstins.map((g) => squash(g)).filter(Boolean);
  if (f.issuedToGstin && ours.length && !ours.includes(squash(f.issuedToGstin))) {
    issues.push({
      code: "NOT_ADDRESSED_TO_US",
      message: `Issued to GSTIN ${f.issuedToGstin}, which is not one of our branches.`,
    });
  }

  return issues;
}
