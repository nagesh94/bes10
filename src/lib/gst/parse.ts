import { toIsoDate } from "@/lib/dcr/fields";
import {
  EMPTY_BILL,
  STATE_CODES,
  kindForCode,
  money,
  panFromGstin,
  stateCode,
  toAmount,
  type GstBillFields,
  type GstItemFields,
} from "./fields";

/**
 * Reads a GST bill from its PDF text layer, without a model.
 *
 * Written against Tally's invoice layout, which most small Indian suppliers
 * print from, but every rule is a label or a shape rather than a position, so
 * other generated invoices read partly too. Whatever this misses is left
 * empty — never guessed — and the bill's own arithmetic (`checkBill`) decides
 * whether the result can be trusted or Gemini has to be asked.
 *
 * One quirk shapes the item rules: unpdf emits a Tally item row's numbers
 * right-to-left and run together — "27,500.00mtr55.00500.0000 mtr85446090"
 * is amount, unit, rate, quantity, HSN. Both that order and the printed
 * left-to-right order are accepted.
 */

const AMOUNT = String.raw`\d[\d,]*\.\d{2}`;
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const DATE_RE = /\b(\d{1,2}[-\s/][A-Za-z]{3}[A-Za-z]*[-\s/]\d{2,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}-\d{2}-\d{2})\b/;

/** Tally row as extracted: amount, unit, rate, quantity unit, HSN. */
const ROW_TALLY = new RegExp(
  String.raw`^(.*?)\s*(-?${AMOUNT})([A-Za-z][A-Za-z.]*)?(${AMOUNT})(\d[\d,]*(?:\.\d+)?)\s*([A-Za-z][A-Za-z.]*)\s*(\d{4,8})$`,
);
/** Row as printed: description, HSN, quantity unit, rate, [unit], amount. */
const ROW_PRINTED = new RegExp(
  String.raw`^(.*?)\s+(\d{4,8})\s+(\d[\d,]*(?:\.\d+)?)\s*([A-Za-z][A-Za-z.]*)\s+(${AMOUNT})\s+(?:[A-Za-z][A-Za-z.]*\s+)?(-?${AMOUNT})$`,
);

const num = (s: string) => String(toAmount(s));

interface ParsedRow {
  prefix: string;
  item: Omit<GstItemFields, "description" | "kind" | "gstRate">;
}

function matchRow(line: string): ParsedRow | null {
  let m = ROW_TALLY.exec(line);
  if (m) {
    return {
      prefix: m[1]!.trim(),
      item: {
        taxableValue: num(m[2]!),
        unit: m[6]!.replace(/\.$/, ""),
        rate: num(m[4]!),
        quantity: num(m[5]!),
        hsnSac: m[7]!,
      },
    };
  }
  m = ROW_PRINTED.exec(line);
  if (m) {
    return {
      prefix: m[1]!.trim(),
      item: {
        hsnSac: m[2]!,
        quantity: num(m[3]!),
        unit: m[4]!.replace(/\.$/, ""),
        rate: num(m[5]!),
        taxableValue: num(m[6]!),
      },
    };
  }
  return null;
}

/** A line that is a label and one amount: "CGST 6,628.50", "Less : Round Off (-)0.40". */
const LABELLED_AMOUNT = new RegExp(String.raw`^(.*?)\s*(\(-\)|-)?\s*(${AMOUNT})\s*$`);

type Head = "cgst" | "sgst" | "igst" | "cess" | "tcs" | "roundOff" | "total" | "discount" | "charge" | "ignore";

function headFor(label: string): Head {
  const l = label.toLowerCase();
  if (/continued|page\s*\d/.test(l)) return "ignore";
  if (/\bcgst\b|central\s*tax/.test(l)) return "cgst";
  if (/\b(sgst|utgst)\b|state\s*tax/.test(l)) return "sgst";
  if (/\bigst\b|integrated\s*tax/.test(l)) return "igst";
  if (/\bcess\b/.test(l)) return "cess";
  if (/\btcs\b/.test(l)) return "tcs";
  if (/round/.test(l)) return "roundOff";
  if (/^(grand\s*)?total\b/.test(l.trim())) return "total";
  if (/discount|\bless\b/.test(l)) return "discount";
  return "charge";
}

/** Tally prints the financial year after the company name: "SHRI BALAJI INDUSTRIES - 2026-2027 -". */
export function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\s*[-–(]*\s*(?:from\s+)?\d{1,2}-[A-Za-z]{3}-\d{2,4}\s*\)?\s*$/i, "")
    .replace(/\s*[-–]?\s*\(?\s*\d{4}\s*[-–]\s*\d{2,4}\s*\)?\s*[-–]?\s*$/, "")
    .trim();
}

/** Lines that are part of an invoice's furniture, not a company block. */
const HEADER_LINE =
  /^(tax\s*invoice|e-?invoice|invoice|bill\s*of\s*supply|credit\s*note|debit\s*note|original|duplicate|triplicate|irn\b|ack\s*(no|date)|.*\bfor\s+recipient\b)/i;

function isAmountOnly(line: string) {
  return new RegExp(String.raw`^-?${AMOUNT}$`).test(line.trim());
}

export function parseGstText(text: string): GstBillFields {
  const f: GstBillFields = { ...EMPTY_BILL, items: [] };
  if (!text.trim()) return f;

  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const nonEmpty = lines.filter(Boolean);
  const joined = nonEmpty.join("\n");

  /* Document type */
  const head = nonEmpty.slice(0, 12).join(" ").toLowerCase();
  if (/bill\s*of\s*supply/.test(head)) f.docType = "bill_of_supply";
  else if (/credit\s*note/.test(head)) f.docType = "credit_note";
  else if (/debit\s*note/.test(head)) f.docType = "debit_note";
  else f.docType = "tax_invoice";

  /* e-Invoice */
  const irnAt = nonEmpty.findIndex((l) => /^IRN\b/i.test(l));
  if (irnAt >= 0) {
    // The IRN is 64 hex characters, often wrapped onto a second line.
    let hex = "";
    for (let i = irnAt; i < Math.min(irnAt + 3, nonEmpty.length) && hex.length < 64; i++) {
      const part = i === irnAt ? nonEmpty[i]!.replace(/^IRN\s*:?\s*/i, "") : nonEmpty[i]!;
      if (i > irnAt && /^ack/i.test(part)) break;
      hex += part.replace(/[^0-9a-fA-F]/g, "");
    }
    if (hex.length === 64) f.irn = hex.toLowerCase();
  }
  f.ackNo = /Ack\.?\s*No\.?\s*:?\s*(\d{10,})/i.exec(joined)?.[1] ?? "";
  const ackDate = /Ack\.?\s*Date\s*:?\s*([^\n]+)/i.exec(joined)?.[1];
  if (ackDate) f.ackDate = toIsoDate(DATE_RE.exec(ackDate)?.[1] ?? "");
  f.ewayBillNo = /e-?\s*way\s*bill\s*(?:no\.?|number)?\s*:?\s*(\d{12})/i.exec(joined)?.[1] ?? "";

  /* Invoice number and date */
  const invAt = nonEmpty.findIndex((l) => /^invoice\s*(no\.?|number|#)/i.test(l));
  if (invAt >= 0) {
    const same = /^invoice\s*(?:no\.?|number|#)\s*:?\s*([A-Za-z0-9].*)$/i.exec(nonEmpty[invAt]!)?.[1];
    const value = (same ?? nonEmpty[invAt + 1] ?? "").trim();
    // Tally puts the value on the next line; a label there means it is blank.
    if (value && !/^(delivery|dated?|reference|mode|buyer|dispatch)/i.test(value)) f.invoiceNo = value.split(/\s+dated?\b/i)[0]!.trim();
  }
  const datedAt = nonEmpty.findIndex((l, i) => i > Math.max(invAt, 0) - 1 && /^(dated?|invoice\s*date)\b/i.test(l));
  if (datedAt >= 0) {
    const inline = DATE_RE.exec(nonEmpty[datedAt]!)?.[1];
    const next = DATE_RE.exec(nonEmpty[datedAt + 1] ?? "")?.[1];
    f.invoiceDate = toIsoDate(inline ?? next ?? "");
  }

  /* Parties. Every GSTIN on the page, in order, with the line it is on. */
  const gstinLines: { at: number; gstin: string }[] = [];
  nonEmpty.forEach((l, at) => {
    for (const g of l.toUpperCase().match(GSTIN_RE) ?? []) gstinLines.push({ at, gstin: g });
  });
  const distinct = [...new Set(gstinLines.map((g) => g.gstin))];

  const buyerAt = nonEmpty.findIndex((l) => /^(buyer|bill\s*to|billed\s*to|details\s*of\s*receiver)/i.test(l));
  const buyerGstin = buyerAt >= 0 ? gstinLines.find((g) => g.at > buyerAt)?.gstin : undefined;

  // The seller is the first GSTIN on the page — the letterhead. The buyer is
  // the one under "Buyer (Bill to)" when that label exists, otherwise the
  // next distinct GSTIN (the consignee, usually the same party).
  const first = gstinLines[0];
  if (first) {
    f.sellerGstin = first.gstin;
    f.buyerGstin = buyerGstin ?? distinct.find((g) => g !== first.gstin) ?? "";
    if (f.buyerGstin === f.sellerGstin) f.buyerGstin = distinct.find((g) => g !== first.gstin) ?? "";

    // Seller block: the lines above its GSTIN, back to the invoice furniture.
    const block: string[] = [];
    for (let i = first.at - 1; i >= 0 && block.length < 8; i--) {
      const l = nonEmpty[i]!;
      if (HEADER_LINE.test(l) || /^[0-9a-f-]{16,}$/i.test(l)) break;
      block.unshift(l);
    }
    if (block.length) {
      f.sellerName = cleanCompanyName(block[0]!);
      f.sellerAddress = block.slice(1).join(", ");
      f.sellerPincode = /\b(\d{6})\b/.exec(f.sellerAddress)?.[1] ?? "";
    }
    // Lines right under the seller's GSTIN: state, e-mail, phone.
    for (let i = first.at; i < Math.min(first.at + 5, nonEmpty.length); i++) {
      const l = nonEmpty[i]!;
      if (/consignee|buyer|ship\s*to|bill\s*to/i.test(l)) break;
      const state = /State\s*Name\s*:?\s*([A-Za-z &]+?)\s*(?:,|$)/i.exec(l)?.[1];
      if (state) f.sellerState = state.trim();
      const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(l)?.[0];
      if (email) f.sellerEmail = email;
      const phone = /(?:ph(?:one)?|mob(?:ile)?|contact|tel)\.?\s*(?:no\.?)?\s*:?\s*([+\d][\d\s,/-]{7,})/i.exec(l)?.[1];
      if (phone) f.sellerPhone = phone.trim();
    }
    if (!f.sellerState) f.sellerState = STATE_CODES[first.gstin.slice(0, 2)] ?? "";
  }
  const pan = /(?:Company[’'`s]*\s*)?PAN\s*(?:No\.?)?\s*:?\s*([A-Z]{5}\d{4}[A-Z])\b/.exec(joined)?.[1];
  f.sellerPan = pan ?? panFromGstin(f.sellerGstin);

  if (buyerAt >= 0) {
    const name = nonEmpty[buyerAt]!.replace(/^(buyer\s*\(bill\s*to\)|buyer|bill(ed)?\s*to|details\s*of\s*receiver)\s*:?\s*/i, "").trim();
    f.buyerName = cleanCompanyName(name || nonEmpty[buyerAt + 1] || "");
  }

  /* Place of supply and reverse charge */
  const pos = /Place\s*of\s*Supply\s*:?\s*([^\n]+)/i.exec(joined)?.[1];
  f.placeOfSupply = (pos && stateCode(pos)) || (f.buyerGstin ? f.buyerGstin.slice(0, 2) : "");
  const rc = /Reverse\s*Charge\s*(?:\(Y\/N\))?\s*:?\s*(Yes|No|Y|N)\b/i.exec(joined)?.[1];
  f.reverseCharge = rc && /^y/i.test(rc) ? "yes" : "no";

  /* Items, charges and tax lines */
  let inItems = false;
  let expected = 1;
  let open: { desc: string[] } | null = null;
  let subtotal = NaN;
  const totals: Partial<Record<Head, number>> = {};

  const pushItem = (desc: string[], row: ParsedRow["item"]) => {
    f.items.push({
      kind: kindForCode(row.hsnSac),
      description: desc.join(" ").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim(),
      gstRate: "",
      ...row,
    });
  };

  for (const line of nonEmpty) {
    if (/^(sl|s\.?\s*no|sr\.?\s*no|#)\b.*description/i.test(line)) {
      inItems = true;
      open = null;
      continue;
    }
    if (!inItems) continue;
    if (/^no\.?$/i.test(line)) continue;
    if (/amount\s*chargeable|in\s*words|^hsn\/sac\b/i.test(line)) {
      inItems = false;
      continue;
    }
    if (/continued\s*to\s*page|computer\s*generated/i.test(line)) {
      inItems = false;
      continue;
    }

    const start = /^(\d{1,3})\s+(.+)$/.exec(line);
    if (start && Number(start[1]) === expected) {
      expected++;
      const row = matchRow(start[2]!);
      if (row) {
        pushItem([row.prefix], row.item);
        open = null;
      } else {
        open = { desc: [start[2]!] };
      }
      continue;
    }

    if (open) {
      const row = matchRow(line);
      if (row) {
        pushItem([...open.desc, row.prefix].filter(Boolean), row.item);
        open = null;
      } else {
        open.desc.push(line);
      }
      continue;
    }

    if (isAmountOnly(line)) {
      subtotal = toAmount(line);
      continue;
    }

    const m = LABELLED_AMOUNT.exec(line);
    if (!m || !m[1]) continue;
    const label = m[1].replace(/[^\x20-\x7E]/g, "").trim();
    const value = (m[2] ? -1 : 1) * toAmount(m[3]!);
    const h = headFor(label);
    if (h === "ignore") continue;
    if (h === "total") {
      totals.total = value;
      inItems = false;
      continue;
    }
    if (h === "charge" || h === "discount") {
      const v = h === "discount" ? -Math.abs(value) : value;
      f.items.push({
        kind: h,
        description: label.replace(/^less\s*:?\s*/i, "").replace(/[@:]\s*$/, "").trim() || (h === "discount" ? "Discount" : "Charge"),
        hsnSac: "",
        quantity: "",
        unit: "",
        rate: "",
        taxableValue: String(v),
        gstRate: "",
      });
      continue;
    }
    totals[h] = (totals[h] ?? 0) + value;
  }

  // A Tally total sits on a line of its own when the rupee glyph is mangled.
  if (totals.total === undefined) {
    const t = new RegExp(String.raw`^(?:grand\s*)?total\b[^\d]*(${AMOUNT})\s*$`, "im").exec(joined)?.[1];
    if (t) totals.total = toAmount(t);
  }

  /* HSN summary: the rate for each HSN */
  const rates = readHsnSummary(nonEmpty);
  for (const item of f.items) {
    if (item.hsnSac && rates.has(item.hsnSac)) item.gstRate = String(rates.get(item.hsnSac));
  }

  const taxable = f.items.reduce((s, i) => s + (Number(i.taxableValue) || 0), 0);
  f.taxableValue = f.items.length ? money(taxable) : Number.isFinite(subtotal) ? money(subtotal) : "";
  for (const k of ["cgst", "sgst", "igst", "cess", "tcs", "roundOff", "total"] as const) {
    const v = totals[k];
    f[k] = v === undefined ? "" : money(v);
  }

  // One rate for the whole bill when there is no summary table to say otherwise.
  const tax = (totals.cgst ?? 0) + (totals.sgst ?? 0) + (totals.igst ?? 0);
  const goodsTaxable = f.items.filter((i) => i.kind !== "discount").reduce((s, i) => s + (Number(i.taxableValue) || 0), 0);
  if (rates.size === 0 && taxable > 0 && tax > 0) {
    const effective = (tax / taxable) * 100;
    const standard = [0.25, 1.5, 3, 5, 6, 12, 18, 28].find((r) => Math.abs(r - effective) < 0.05);
    if (standard !== undefined) for (const i of f.items) i.gstRate = String(standard);
  }
  // Freight and packing are taxed at the rate of what they carried.
  const rateValues = [...new Set(f.items.filter((i) => i.gstRate).map((i) => i.gstRate))];
  if (rateValues.length === 1 && goodsTaxable > 0) {
    for (const i of f.items) if (!i.gstRate) i.gstRate = rateValues[0]!;
  }

  return f;
}

/**
 * The HSN-wise tax table at the foot of the bill. Read order-blind: in each
 * row the percentages are the rates (two for CGST+SGST, one for IGST) and
 * the HSN is the leading code, whatever order the columns came out in.
 */
function readHsnSummary(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  let inTable = false;
  for (const line of lines) {
    if (/^hsn\/?sac\b/i.test(line) && /taxable|tax/i.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^total\b/i.test(line) || /in\s*words/i.test(line)) {
      inTable = false;
      continue;
    }
    const m = /^(\d{4,8})\s+(.*)$/.exec(line);
    if (!m) continue;
    const tokens = m[2]!.match(new RegExp(String.raw`${AMOUNT}|\d+(?:\.\d+)?\s*%`, "g")) ?? [];
    const percents = tokens.filter((t) => t.endsWith("%")).map((t) => Number(t.replace(/[%\s]/g, "")));
    if (!percents.length) continue;
    const sum = percents.reduce((s, p) => s + p, 0);
    out.set(m[1]!, Math.round(sum * 100) / 100);
  }
  return out;
}

