import type { DcrChainStep } from "@/lib/db/schema/dcr";

/**
 * Everything read off a DCR certificate, in the shape the review form edits.
 *
 * Strings throughout (dates as yyyy-mm-dd, numbers as text) because this is
 * what the form round-trips; `saveDcrCertificate` is where they become typed.
 */
export interface DcrFields {
  certificateNo: string;
  revision: string;
  certType: string;
  certDate: string;

  supplierName: string;
  supplierGstin: string;
  supplierPan: string;
  supplierAddress: string;
  supplierState: string;
  supplierPincode: string;

  issuedToName: string;
  issuedToGstin: string;

  purchaseOrderNo: string;
  invoiceRef: string;
  invoiceDate: string;

  cellManufacturer: string;
  cellManufacturerAddress: string;
  moduleManufacturer: string;
  moduleManufacturerAddress: string;

  modelNo: string;
  moduleDescription: string;
  wattPeak: string;
  efficiency: string;
  technology: string;
  cellModel: string;
  quantity: string;
  totalKw: string;

  chain: DcrChainStep[];
  serials: { serialNo: string; wattPeak: string }[];
}

export const EMPTY_FIELDS: DcrFields = {
  certificateNo: "",
  revision: "",
  certType: "",
  certDate: "",
  supplierName: "",
  supplierGstin: "",
  supplierPan: "",
  supplierAddress: "",
  supplierState: "",
  supplierPincode: "",
  issuedToName: "",
  issuedToGstin: "",
  purchaseOrderNo: "",
  invoiceRef: "",
  invoiceDate: "",
  cellManufacturer: "",
  cellManufacturerAddress: "",
  moduleManufacturer: "",
  moduleManufacturerAddress: "",
  modelNo: "",
  moduleDescription: "",
  wattPeak: "",
  efficiency: "",
  technology: "",
  cellModel: "",
  quantity: "",
  totalKw: "",
  chain: [],
  serials: [],
};

/** The scalar keys — what the model is asked for and what a mismatch can name. */
export type DcrScalarKey = Exclude<keyof DcrFields, "chain" | "serials">;

export const SCALAR_KEYS = Object.keys(EMPTY_FIELDS).filter(
  (k) => k !== "chain" && k !== "serials",
) as DcrScalarKey[];

/**
 * Serials are compared upper-cased with all whitespace removed, so a serial
 * typed on site as "nsms 2610 0028841" still finds its certificate.
 */
export function normaliseSerial(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** GSTIN and PAN compare the same way. */
export function normaliseId(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * "17-Nov-2026" or "28-Oct-26" or "17/11/2026" → "2026-11-17". Anything it
 * cannot read comes back empty rather than guessed.
 */
export function toIsoDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = /^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (!month) return "";
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${year}-${month}-${m[1]!.padStart(2, "0")}`;
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;

  return "";
}
