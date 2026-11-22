/**
 * Everything read off a GST bill, in the shape the review form edits.
 *
 * Strings throughout (dates as yyyy-mm-dd, amounts as plain decimals) because
 * this is what the form round-trips; `saveGstBill` is where they become typed.
 * Seller and buyer are both kept: which of them is "the party" depends on
 * whether the bill is a purchase or a sale, which is decided by whose GSTIN
 * is ours.
 */

export const DOC_TYPES = ["tax_invoice", "bill_of_supply", "credit_note", "debit_note", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  tax_invoice: "Tax invoice",
  bill_of_supply: "Bill of supply",
  credit_note: "Credit note",
  debit_note: "Debit note",
  other: "Other",
};

export const ITEM_KINDS = ["goods", "service", "charge", "discount"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  goods: "Goods",
  service: "Service",
  charge: "Charge",
  discount: "Discount",
};

export type Direction = "purchase" | "sales";

export interface GstItemFields {
  kind: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  rate: string;
  /** Negative for a discount line. */
  taxableValue: string;
  /** Total GST percent: "18" for 9% + 9%. */
  gstRate: string;
}

export interface GstBillFields {
  docType: string;
  invoiceNo: string;
  invoiceDate: string;

  sellerName: string;
  sellerGstin: string;
  sellerPan: string;
  sellerAddress: string;
  sellerState: string;
  sellerPincode: string;
  sellerPhone: string;
  sellerEmail: string;

  buyerName: string;
  buyerGstin: string;

  /** Two-digit state code. */
  placeOfSupply: string;
  /** "yes" or "no". */
  reverseCharge: string;

  irn: string;
  ackNo: string;
  ackDate: string;
  ewayBillNo: string;
  buyerOrderNo: string;
  refInvoiceNo: string;
  refInvoiceDate: string;

  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  tcs: string;
  roundOff: string;
  total: string;

  items: GstItemFields[];
}

export const EMPTY_ITEM: GstItemFields = {
  kind: "goods",
  description: "",
  hsnSac: "",
  quantity: "",
  unit: "",
  rate: "",
  taxableValue: "",
  gstRate: "",
};

export const EMPTY_BILL: GstBillFields = {
  docType: "tax_invoice",
  invoiceNo: "",
  invoiceDate: "",
  sellerName: "",
  sellerGstin: "",
  sellerPan: "",
  sellerAddress: "",
  sellerState: "",
  sellerPincode: "",
  sellerPhone: "",
  sellerEmail: "",
  buyerName: "",
  buyerGstin: "",
  placeOfSupply: "",
  reverseCharge: "no",
  irn: "",
  ackNo: "",
  ackDate: "",
  ewayBillNo: "",
  buyerOrderNo: "",
  refInvoiceNo: "",
  refInvoiceDate: "",
  taxableValue: "",
  cgst: "",
  sgst: "",
  igst: "",
  cess: "",
  tcs: "",
  roundOff: "",
  total: "",
  items: [],
};

export type GstScalarKey = Exclude<keyof GstBillFields, "items">;

export const SCALAR_KEYS = Object.keys(EMPTY_BILL).filter((k) => k !== "items") as GstScalarKey[];

export const MONEY_KEYS = ["taxableValue", "cgst", "sgst", "igst", "cess", "tcs", "roundOff", "total"] as const;
export type MoneyKey = (typeof MONEY_KEYS)[number];

/** "1,23,456.70" or "₹ 86,907" or "(-)0.40" → a number; anything else → NaN. */
export function toAmount(raw: string | null | undefined): number {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  const negative = /^\(-\)|^-|^\(.*\)$/.test(s);
  const digits = s.replace(/[^\d.]/g, "");
  if (!digits || !/\d/.test(digits)) return NaN;
  const n = Number(digits);
  return Number.isFinite(n) ? (negative ? -n : n) : NaN;
}

/** An empty field counts as zero in arithmetic. */
export const amt = (raw: string | null | undefined) => {
  const n = toAmount(raw);
  return Number.isFinite(n) ? n : 0;
};

export const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/* ── GSTIN ───────────────────────────────────────────────────────────── */

const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Shape and check digit. The 15th character is a checksum over the first
 * fourteen, so a GSTIN misread by one character — a scan, a model guessing
 * O for 0 — is caught here rather than creating a second supplier.
 */
export function isValidGstin(raw: string): boolean {
  const g = raw.replace(/\s+/g, "").toUpperCase();
  if (!GSTIN_SHAPE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = BASE36.indexOf(g[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return BASE36[(36 - (sum % 36)) % 36] === g[14];
}

/** The PAN is characters 3–12 of a GSTIN. */
export const panFromGstin = (gstin: string) => (GSTIN_SHAPE.test(gstin) ? gstin.slice(2, 12) : "");

/* ── States ──────────────────────────────────────────────────────────── */

/** GST state codes. The first two digits of a GSTIN are one of these. */
export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

const squashName = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** "Madhya Pradesh", "23", "23-Madhya Pradesh" → "23". Unknown → "". */
export function stateCode(raw: string): string {
  const s = raw.trim();
  const lead = /^(\d{1,2})\b/.exec(s);
  if (lead) {
    const code = lead[1]!.padStart(2, "0");
    if (STATE_CODES[code]) return code;
  }
  const want = squashName(s.replace(/^\d+\s*[-–:]?\s*/, ""));
  if (!want) return "";
  for (const [code, name] of Object.entries(STATE_CODES)) {
    if (squashName(name) === want) return code;
  }
  return "";
}

/** SAC codes (services) start with 99; everything else is an HSN for goods. */
export const kindForCode = (hsnSac: string): ItemKind => (/^99/.test(hsnSac.trim()) ? "service" : "goods");
