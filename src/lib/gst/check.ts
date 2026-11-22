import { normaliseId } from "@/lib/dcr/fields";
import { amt, isValidGstin, money, toAmount, type Direction, type GstBillFields } from "./fields";

/**
 * The arithmetic a GST bill must agree with itself on.
 *
 * This is what makes extraction trustworthy without reading every number by
 * eye: lines add up to the taxable value, taxable value plus tax plus
 * round-off is the total, each line's rate explains the tax, and the tax
 * head (CGST+SGST or IGST) matches whether the sale crossed a state line.
 * A bill that passes all of it was read right, or wrong in a way that
 * happens to balance — which is rare enough to accept.
 */

export interface BillIssue {
  code:
    | "MISSING"
    | "ITEMS_TAXABLE"
    | "TOTAL"
    | "RATE_TAX"
    | "CGST_SGST"
    | "MIXED_HEADS"
    | "WRONG_HEAD"
    | "GSTIN_INVALID"
    | "NOT_OURS"
    | "BOS_TAX";
  message: string;
}

/** A rupee either way: bills round each line before adding. */
const TOLERANCE = 1;

const r = (n: number) => `₹${money(n)}`;

export function billTax(f: GstBillFields) {
  return amt(f.cgst) + amt(f.sgst) + amt(f.igst) + amt(f.cess);
}

export function itemsTaxable(f: GstBillFields) {
  return f.items.reduce((s, i) => s + amt(i.taxableValue), 0);
}

export function checkBill(
  f: GstBillFields,
  opts: { ourGstins?: string[]; direction?: Direction } = {},
): BillIssue[] {
  const issues: BillIssue[] = [];

  const missing = [
    !f.invoiceNo.trim() && "invoice number",
    !f.invoiceDate && "invoice date",
    !Number.isFinite(toAmount(f.total)) && "total",
  ].filter(Boolean);
  if (missing.length) issues.push({ code: "MISSING", message: `Not read: ${missing.join(", ")}.` });

  const taxable = amt(f.taxableValue);
  const lines = itemsTaxable(f);
  if (f.items.length && Math.abs(lines - taxable) > TOLERANCE) {
    issues.push({
      code: "ITEMS_TAXABLE",
      message: `The lines add up to ${r(lines)} but the taxable value is ${r(taxable)}.`,
    });
  }

  const tax = billTax(f);
  if (Number.isFinite(toAmount(f.total))) {
    const expected = taxable + tax + amt(f.tcs) + amt(f.roundOff);
    if (Math.abs(expected - amt(f.total)) > TOLERANCE) {
      issues.push({
        code: "TOTAL",
        message: `Taxable ${r(taxable)} + tax ${r(tax)}${amt(f.tcs) ? ` + TCS ${r(amt(f.tcs))}` : ""}${
          amt(f.roundOff) ? ` + round-off ${r(amt(f.roundOff))}` : ""
        } = ${r(expected)}, but the total is ${r(amt(f.total))}.`,
      });
    }
  }

  const gst = amt(f.cgst) + amt(f.sgst) + amt(f.igst);
  if (f.items.length && f.items.every((i) => i.gstRate !== "")) {
    const fromRates = f.items.reduce((s, i) => s + (amt(i.taxableValue) * amt(i.gstRate)) / 100, 0);
    if (Math.abs(fromRates - gst) > TOLERANCE + 0.5 * f.items.length * 0.02) {
      issues.push({
        code: "RATE_TAX",
        message: `The line rates give ${r(fromRates)} of GST, but the bill charges ${r(gst)}.`,
      });
    }
  }

  if (Math.abs(amt(f.cgst) - amt(f.sgst)) > 0.05) {
    issues.push({ code: "CGST_SGST", message: `CGST ${r(amt(f.cgst))} and SGST ${r(amt(f.sgst))} should be equal.` });
  }
  if (amt(f.igst) > 0 && amt(f.cgst) + amt(f.sgst) > 0) {
    issues.push({ code: "MIXED_HEADS", message: "The bill charges both IGST and CGST/SGST; it should be one or the other." });
  }

  const sellerState = f.sellerGstin.slice(0, 2);
  if (sellerState && f.placeOfSupply && gst > 0) {
    const intra = sellerState === f.placeOfSupply;
    if (intra && amt(f.igst) > 0) {
      issues.push({ code: "WRONG_HEAD", message: "Seller and place of supply are in the same state, so the tax should be CGST + SGST, not IGST." });
    } else if (!intra && amt(f.cgst) + amt(f.sgst) > 0) {
      issues.push({ code: "WRONG_HEAD", message: "Seller and place of supply are in different states, so the tax should be IGST, not CGST + SGST." });
    }
  }

  const bad = [f.sellerGstin, f.buyerGstin].filter((g) => g && !isValidGstin(g));
  if (bad.length) {
    issues.push({
      code: "GSTIN_INVALID",
      message: `${bad.join(", ")} ${bad.length === 1 ? "is" : "are"} not a valid GSTIN (the check digit fails). Check against the bill.`,
    });
  }

  const ours = (opts.ourGstins ?? []).map(normaliseId).filter(Boolean);
  if (ours.length) {
    const ourSide = opts.direction === "sales" ? f.sellerGstin : f.buyerGstin;
    if (ourSide && !ours.includes(normaliseId(ourSide))) {
      issues.push({
        code: "NOT_OURS",
        message:
          opts.direction === "sales"
            ? `The seller's GSTIN ${ourSide} is not one of ours.`
            : `Billed to GSTIN ${ourSide}, which is not one of ours.`,
      });
    }
  }

  if (f.docType === "bill_of_supply" && gst > 0) {
    issues.push({ code: "BOS_TAX", message: "A bill of supply carries no GST, but tax amounts were read." });
  }

  return issues;
}

/** The arithmetic codes: if none fire, the numbers were read right. */
const ARITHMETIC: BillIssue["code"][] = ["MISSING", "ITEMS_TAXABLE", "TOTAL", "RATE_TAX", "CGST_SGST", "MIXED_HEADS"];

/** Read completely and every number agrees: no need to ask a model. */
export function isComplete(f: GstBillFields): boolean {
  if (!f.items.length || !f.sellerName || !f.sellerGstin) return false;
  return !checkBill(f).some((i) => ARITHMETIC.includes(i.code) || i.code === "GSTIN_INVALID");
}
