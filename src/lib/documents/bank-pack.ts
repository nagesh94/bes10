import type { DocType } from "./types";

/**
 * The bank file, defined once.
 *
 * This same list drives the checklist on the agreement page and, in phase 4,
 * the one-click merged print pack — so the soft copy and the hard copy can
 * never drift apart.
 *
 * Order matters: it is the order the bank wants the physical file in.
 *
 * Only relevant when the project involves finance. A cash project has no
 * bank file at all.
 */

export interface BankPackItem {
  docType: DocType;
  label: string;
  /** Where it comes from, so the page can say "already collected". */
  source: "stage1" | "stage2" | "portal";
  hint: string;
  /** Rough page count for the cover checklist. Real counts replace these. */
  pages: number;
}

/** What the printer produces, in bank order. */
export const BANK_PACK_PRINTABLE: BankPackItem[] = [
  {
    docType: "AADHAAR",
    label: "Aadhaar card",
    source: "stage1",
    hint: "Collected in the prospect form",
    pages: 1,
  },
  {
    docType: "PAN",
    label: "PAN card",
    source: "stage1",
    hint: "Collected in the prospect form",
    pages: 1,
  },
  {
    docType: "ELECTRICITY_BILL",
    label: "Electricity bill",
    source: "stage1",
    hint: "Collected in the prospect form",
    pages: 2,
  },
  {
    docType: "CANCELLED_CHEQUE",
    label: "Cancelled cheque",
    source: "stage1",
    hint: "Collected in the prospect form",
    pages: 1,
  },
  {
    docType: "BANK_STATEMENT",
    label: "Bank statement",
    source: "stage1",
    hint: "Last six months",
    pages: 6,
  },
  {
    docType: "QUOTATION",
    label: "Quotation",
    source: "stage2",
    hint: "Priced outside the app",
    pages: 2,
  },
  {
    docType: "AGREEMENT_SIGNED",
    label: "Vendor agreement — signed",
    source: "stage2",
    hint: "The notarised scan, not the generated draft",
    pages: 4,
  },
  {
    docType: "ACKNOWLEDGEMENT",
    label: "Acknowledgement",
    source: "portal",
    hint: "Issued on PM Surya Ghar when the application goes in",
    pages: 1,
  },
  {
    docType: "FEASIBILITY_REPORT",
    label: "Feasibility report",
    source: "portal",
    hint: "The DISCOM's own report — not the site feasibility report below",
    pages: 1,
  },
  {
    docType: "SITE_FEASIBILITY",
    label: "Site feasibility report",
    source: "portal",
    hint: "Auto-generated on PM Surya Ghar — download and upload it here",
    pages: 2,
  },
  {
    docType: "E_TOKEN",
    label: "E-token",
    source: "portal",
    hint: "Auto-generated on PM Surya Ghar — download and upload it here",
    pages: 1,
  },
  {
    docType: "SANCTION_LETTER",
    label: "Jan Samarth sanction letter",
    source: "portal",
    hint: "Downloaded from Jan Samarth once the loan clears",
    pages: 2,
  },
  {
    docType: "DIGITAL_APPROVAL_LETTER",
    label: "Digital approval letter",
    source: "portal",
    hint: "The other Jan Samarth download — issued with the sanction, filed after it",
    pages: 1,
  },
];

/**
 * Objects, not files. A printer cannot produce these, so they go on the
 * cover checklist instead — which is how nobody reaches the bank a cheque
 * short.
 */
export const BANK_PACK_PHYSICAL: Array<{ label: string; qty: string; note?: string }> = [
  {
    label: "Passport photographs",
    qty: "× 2",
    note: "A scan can be kept on file, but the bank wants prints",
  },
  { label: "Cheques", qty: "× 3", note: "Security cheques, signed" },
  { label: "Stamp paper", qty: "₹1,500", note: "Non-judicial" },
];

/**
 * A co-applicant on the loan brings their own identity set. Filed after the
 * main applicant's documents, before the quotation.
 */
export const BANK_PACK_CO_APPLICANT: BankPackItem[] = [
  {
    docType: "COAPP_AADHAAR",
    label: "Co-applicant Aadhaar card",
    source: "stage1",
    hint: "Collected with the bank details",
    pages: 1,
  },
  {
    docType: "COAPP_PAN",
    label: "Co-applicant PAN card",
    source: "stage1",
    hint: "Collected with the bank details",
    pages: 1,
  },
  {
    docType: "COAPP_PASSBOOK",
    label: "Co-applicant bank passbook",
    source: "stage1",
    hint: "Collected with the bank details",
    pages: 2,
  },
  {
    docType: "COAPP_PHOTO",
    label: "Co-applicant photographs",
    source: "stage1",
    hint: "Scan on file; two prints attached by hand",
    pages: 1,
  },
];

/**
 * The full printable list for a project, which depends on whether there is
 * a co-applicant. One function so the checklist and the print pack agree.
 */
export function bankPackFor(hasCoApplicant: boolean): BankPackItem[] {
  if (!hasCoApplicant) return BANK_PACK_PRINTABLE;
  const cut = BANK_PACK_PRINTABLE.findIndex((i) => i.docType === "QUOTATION");
  return [
    ...BANK_PACK_PRINTABLE.slice(0, cut),
    ...BANK_PACK_CO_APPLICANT,
    ...BANK_PACK_PRINTABLE.slice(cut),
  ];
}

/** Two more prints when there is a co-applicant. */
export function physicalItemsFor(hasCoApplicant: boolean) {
  if (!hasCoApplicant) return BANK_PACK_PHYSICAL;
  return BANK_PACK_PHYSICAL.map((p) =>
    p.label === "Passport photographs"
      ? { ...p, qty: "× 4", note: "Two for the applicant, two for the co-applicant" }
      : p,
  );
}

/** Cover sheet + every printable item. */
export function estimatedPages(hasCoApplicant = false): number {
  return 1 + bankPackFor(hasCoApplicant).reduce((sum, i) => sum + i.pages, 0);
}
