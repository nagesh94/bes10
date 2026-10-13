/**
 * Document types and how each is classed.
 *
 * This lives outside the server-action file on purpose: a "use server" module
 * may only export async functions, so a plain object exported from one stops
 * the whole module loading — and the failure surfaces far away, as a generic
 * upload error in the browser.
 *
 * COLLECTED is anything prepared outside the app and uploaded, which includes
 * the NOC. EXTERNAL is downloaded from a government portal and uploaded back
 * here.
 *
 * QUOTATION is the one type that arrives either way, so its class is settled
 * per row rather than by this table: one the quotation maker produced is
 * filed GENERATED, one scanned in from before the app existed is COLLECTED.
 * The class here is the default for an upload.
 *
 * `category` is the coarse, four-way filing the office actually thinks in —
 * general, bank, legal, DISCOM — as dictated by the user on 12 Oct 2026. It
 * is separate from `DOC_GROUPS` below: that is the fine-grained "where is
 * the cancelled cheque" index on the all-projects `/documents` page, this is
 * the broad bucket a single project's document page sorts into.
 */
export const DOC_CATEGORIES = {
  GENERAL: { label: "General documents" },
  BANK: { label: "Bank" },
  LEGAL: { label: "Legal" },
  DISCOM: { label: "DISCOM" },
} as const;

export type DocCategory = keyof typeof DOC_CATEGORIES;

export const DOC_TYPES = {
  AADHAAR: { label: "Aadhaar card", class: "COLLECTED", category: "GENERAL" },
  PAN: { label: "PAN card", class: "COLLECTED", category: "GENERAL" },
  ELECTRICITY_BILL: { label: "Electricity bill", class: "COLLECTED", category: "GENERAL" },
  CANCELLED_CHEQUE: { label: "Cancelled cheque", class: "COLLECTED", category: "BANK" },
  BANK_STATEMENT: { label: "Bank statement", class: "COLLECTED", category: "BANK" },
  PASSBOOK: { label: "Passbook photo", class: "COLLECTED", category: "BANK" },
  COAPP_AADHAAR: { label: "Co-applicant Aadhaar card", class: "COLLECTED", category: "GENERAL" },
  COAPP_PAN: { label: "Co-applicant PAN card", class: "COLLECTED", category: "GENERAL" },
  COAPP_PASSBOOK: { label: "Co-applicant bank passbook", class: "COLLECTED", category: "BANK" },
  COAPP_PHOTO: { label: "Co-applicant photographs", class: "COLLECTED", category: "GENERAL" },
  PASSPORT_PHOTO: { label: "Passport photographs", class: "COLLECTED", category: "GENERAL" },
  QUOTATION: { label: "Quotation", class: "COLLECTED", category: "GENERAL" },
  NOC: { label: "NOC certificate", class: "COLLECTED", category: "LEGAL" },
  KHASRA: { label: "Khasra extract", class: "COLLECTED", category: "GENERAL" },
  APPLICANT_PHOTO: { label: "Applicant photo", class: "COLLECTED", category: "GENERAL" },
  SITE_FEASIBILITY: { label: "Site feasibility report", class: "EXTERNAL", category: "DISCOM" },
  ETOKEN_ACK: { label: "E-token acknowledgement", class: "EXTERNAL", category: "DISCOM" },
  SANCTION_LETTER: { label: "Jan Samarth sanction letter", class: "EXTERNAL", category: "BANK" },
  DCR_CERTIFICATE: { label: "DCR certificate", class: "EXTERNAL", category: "DISCOM" },
  METER_RECEIPT: { label: "Meter payment receipt", class: "EXTERNAL", category: "DISCOM" },

  AGREEMENT: { label: "Vendor agreement", class: "GENERATED", category: "LEGAL" },
  WORK_COMPLETION: { label: "Work completion report", class: "GENERATED", category: "DISCOM" },
  JOINT_INSPECTION: { label: "Joint inspection report", class: "GENERATED", category: "DISCOM" },
  ALMM_DECLARATION: { label: "ALMM declaration", class: "GENERATED", category: "DISCOM" },
  DCR_UNDERTAKING: { label: "DCR undertaking (Annexure-I)", class: "GENERATED", category: "DISCOM" },
  COMMISSIONING_CERT: {
    label: "Commissioning certificate (Annexure-II)",
    class: "GENERATED",
    category: "DISCOM",
  },
  SUBMISSION_PACK: {
    label: "Submission pack (merged PDF)",
    class: "GENERATED",
    category: "DISCOM",
  },
  COMMISSIONING_CERT_SIGNED: {
    label: "Commissioning certificate — signed scan",
    class: "EXECUTED",
    category: "DISCOM",
  },
  AGREEMENT_SIGNED: { label: "Vendor agreement — signed scan", class: "EXECUTED", category: "LEGAL" },
  CUSTOMER_SIGNATURE: { label: "Customer signature", class: "COLLECTED", category: "GENERAL" },
} as const satisfies Record<
  string,
  { label: string; class: string; category: DocCategory }
>;

export type DocType = keyof typeof DOC_TYPES;

export function isDocType(value: string): value is DocType {
  return value in DOC_TYPES;
}

/**
 * How the documents library is filed.
 *
 * Staff look for "the bank papers" or "the electricity bill", not for
 * whether a file was generated or collected. Order here is the order those
 * groups appear on the documents page.
 */
export const DOC_GROUPS = [
  { key: "aadhaar", label: "Aadhaar", types: ["AADHAAR"] },
  { key: "pan", label: "PAN", types: ["PAN"] },
  { key: "bank", label: "Bank", types: ["CANCELLED_CHEQUE", "BANK_STATEMENT", "PASSBOOK"] },
  { key: "electricity", label: "Electricity bill", types: ["ELECTRICITY_BILL"] },
  { key: "coApplicant", label: "Co-applicant", types: ["COAPP_AADHAAR", "COAPP_PAN", "COAPP_PASSBOOK", "COAPP_PHOTO"] },
  { key: "photos", label: "Photographs", types: ["PASSPORT_PHOTO", "APPLICANT_PHOTO", "CUSTOMER_SIGNATURE"] },
  { key: "property", label: "Quotation & property", types: ["QUOTATION", "NOC", "KHASRA"] },
  {
    key: "portal",
    label: "Portal",
    types: ["SITE_FEASIBILITY", "ETOKEN_ACK", "SANCTION_LETTER", "DCR_CERTIFICATE", "METER_RECEIPT"],
  },
  {
    key: "generated",
    label: "Generated",
    types: [
      "AGREEMENT",
      "WORK_COMPLETION",
      "JOINT_INSPECTION",
      "ALMM_DECLARATION",
      "DCR_UNDERTAKING",
      "COMMISSIONING_CERT",
      "SUBMISSION_PACK",
    ],
  },
  { key: "signed", label: "Signed scans", types: ["AGREEMENT_SIGNED", "COMMISSIONING_CERT_SIGNED"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; types: readonly DocType[] }>;

export type DocGroupKey = (typeof DOC_GROUPS)[number]["key"];

type GroupedType = (typeof DOC_GROUPS)[number]["types"][number];
/** Every known document type belongs to exactly one group. */
type Ungrouped = Exclude<DocType, GroupedType>;
const _everyTypeGrouped: [Ungrouped] extends [never] ? true : Ungrouped = true;
void _everyTypeGrouped;

const GROUP_BY_TYPE = new Map<string, DocGroupKey>(
  DOC_GROUPS.flatMap((group) => group.types.map((type) => [type, group.key] as const)),
);

export function docGroup(docType: string): DocGroupKey | "other" {
  return GROUP_BY_TYPE.get(docType) ?? "other";
}

/** Stable order inside a group: the type order above, then newest first. */
export function docGroupRank(docType: string): number {
  for (const group of DOC_GROUPS) {
    const index = (group.types as readonly string[]).indexOf(docType);
    if (index >= 0) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Order the four coarse categories appear in on a project's document page. */
export const DOC_CATEGORY_ORDER = ["GENERAL", "BANK", "LEGAL", "DISCOM"] as const satisfies readonly DocCategory[];

export function docCategory(docType: string): DocCategory | "other" {
  return isDocType(docType) ? DOC_TYPES[docType].category : "other";
}
