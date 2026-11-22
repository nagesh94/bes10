import { checkBill } from "./check";
import { MONEY_KEYS, SCALAR_KEYS, toAmount, type GstBillFields, type GstScalarKey } from "./fields";

export type GstMethod = "parser" | "parser+llm" | "llm-text" | "llm-file";

export interface GstConflict {
  key: GstScalarKey;
  parser: string;
  llm: string;
}

export interface MergedBill {
  fields: GstBillFields;
  method: GstMethod;
  /** Both had a value and they disagree. The parser's value is used. */
  conflicts: GstConflict[];
  /** Literal values only the model produced that are not in the text: possibly invented. */
  unverified: GstScalarKey[];
  /** Whose line items were kept. */
  itemsFrom: "parser" | "llm";
}

/** Copied verbatim from the bill, so they must appear somewhere in its text. */
const LITERAL_KEYS: GstScalarKey[] = ["invoiceNo", "sellerGstin", "buyerGstin", "ackNo", "ewayBillNo", "sellerPan"];
const MONEY = new Set<GstScalarKey>(MONEY_KEYS);

const squash = (s: string) => s.replace(/[\s,.\-/]+/g, "").toUpperCase();

function same(key: GstScalarKey, a: string, b: string) {
  if (MONEY.has(key)) {
    const x = toAmount(a);
    const y = toAmount(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return Math.abs(x - y) < 0.005;
  }
  return squash(a) === squash(b);
}

/** How many of the bill's arithmetic checks fail — the score for choosing line items. */
function arithmeticFaults(f: GstBillFields) {
  return checkBill(f).filter((i) => ["ITEMS_TAXABLE", "TOTAL", "RATE_TAX"].includes(i.code)).length;
}

/**
 * Combines the parser's reading with the model's.
 *
 * The parser copies text literally, so where it found a value that value
 * wins and every disagreement is reported. Line items are taken whole from
 * one side, never mixed: whichever set makes the bill's arithmetic agree,
 * the parser's when both do.
 */
export function mergeBill(parsed: GstBillFields, llm: GstBillFields | null, sourceText: string): MergedBill {
  if (!llm) return { fields: parsed, method: "parser", conflicts: [], unverified: [], itemsFrom: "parser" };

  const haystack = squash(sourceText);
  const hasText = haystack.length > 200;
  const fields: GstBillFields = { ...parsed, items: parsed.items };
  const conflicts: GstConflict[] = [];
  const unverified: GstScalarKey[] = [];

  for (const key of SCALAR_KEYS) {
    const p = parsed[key];
    const l = llm[key];
    // Defaults the parser always sets are not readings to defend.
    const parserRead = p && !(key === "reverseCharge" && p === "no") && !(key === "docType" && p === "tax_invoice");
    if (parserRead && l && !same(key, p, l)) conflicts.push({ key, parser: p, llm: l });
    if (!parserRead && l) {
      fields[key] = l;
      if (hasText && LITERAL_KEYS.includes(key) && !haystack.includes(squash(l))) unverified.push(key);
    }
  }

  let itemsFrom: MergedBill["itemsFrom"] = "parser";
  if (llm.items.length) {
    const withParser = parsed.items.length ? arithmeticFaults(fields) : Infinity;
    const withLlm = arithmeticFaults({ ...fields, items: llm.items });
    if (withLlm < withParser) {
      fields.items = llm.items;
      itemsFrom = "llm";
    }
  }

  const parserFoundAnything = Boolean(parsed.invoiceNo || parsed.sellerGstin || parsed.items.length);
  const method: GstMethod = !hasText ? "llm-file" : parserFoundAnything ? "parser+llm" : "llm-text";
  return { fields, method, conflicts, unverified, itemsFrom };
}
