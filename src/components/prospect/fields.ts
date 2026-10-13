import type { SectionKey } from "@/lib/validation/prospect";

/**
 * The shape of each section, declared once.
 *
 * Driving all eight sections off one renderer keeps them visually consistent
 * and means a new field is one line here rather than a new component.
 */

export type FieldType = "text" | "mono" | "number" | "toggle" | "date" | "select" | "combo";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** Spans the full width of the grid. */
  wide?: boolean;
  placeholder?: string;
  hint?: string;
  unit?: string;
  options?: string[];
  /**
   * For type "combo": which runtime option list to suggest from (passed into
   * the form as `comboOptions`). Typing a value not on the list is always
   * allowed — the list is a shortcut, not a restriction.
   */
  comboKey?: string;
  /** Native maxlength, for the fields the office asked to be capped. */
  maxLength?: number;
  /** Rendered as a password field — for re-typing a value to confirm it. */
  mask?: boolean;
}

/** What the generic renderer actually needs: narrow or conditional alike. */
export interface FormSection {
  key: string;
  title: string;
  blurb: string;
  fields: FieldDef[];
  uploads?: UploadDef[];
  uploadsNote?: string;
}

/** A document the section collects alongside its fields. */
export interface UploadDef {
  docType: string;
  label: string;
  hint?: string;
  accept?: string;
}

export interface SectionDef {
  key: SectionKey;
  title: string;
  blurb: string;
  fields: FieldDef[];
  /** Rendered under the fields; each becomes an upload slot. */
  uploads?: UploadDef[];
  uploadsNote?: string;
}

export const SECTIONS: SectionDef[] = [
  {
    key: "user",
    title: "User details",
    blurb: "As it appears on the PM Surya Ghar application.",
    fields: [
      { name: "firstName", label: "First name", type: "text" },
      { name: "lastName", label: "Last name", type: "text" },
      { name: "gender", label: "Gender", type: "select", options: ["", "Male", "Female", "Other"] },
      { name: "phone", label: "Contact number", type: "mono", maxLength: 10, hint: "10 digits" },
      { name: "email", label: "Email address", type: "text" },
      {
        name: "nationalPortalId",
        label: "National Portal ID",
        type: "mono",
        placeholder: "NP-MPMK26-00000000",
        maxLength: 60,
      },
      { name: "address", label: "Address", type: "text", wide: true },
      { name: "pinCode", label: "PIN code", type: "mono", maxLength: 6, hint: "6 digits" },
      { name: "applicationDate", label: "Application date", type: "date" },
      { name: "regionName", label: "Region", type: "text", placeholder: "Bhopal" },
      { name: "circleName", label: "Circle", type: "text", placeholder: "Betul Circle" },
      { name: "divisionName", label: "Division", type: "text", placeholder: "Betul South" },
      { name: "zoneName", label: "Zone / DC", type: "text", placeholder: "Betul Town-II" },
      {
        name: "isDcr",
        label: "Going with DCR?",
        type: "toggle",
        hint: "Domestic content modules. Switches on the stage 5 certificate step.",
      },
      {
        name: "wantsSubsidy",
        label: "Applying for subsidy?",
        type: "toggle",
        hint: "Opens stage 9 settlement and the post-subsidy payment milestone.",
      },
    ],
  },
  {
    key: "rooftop",
    title: "Rooftop details",
    blurb: "Plant size drives the load check, so get it right before the bill section.",
    fields: [
      { name: "plantKw", label: "Plant size", type: "number", unit: "kW", placeholder: "4.82" },
      { name: "latitude", label: "Latitude", type: "mono", placeholder: "21.8840185" },
      { name: "longitude", label: "Longitude", type: "mono", placeholder: "77.9016424" },
    ],
  },
  {
    key: "aadhaar",
    title: "Aadhaar details",
    blurb: "Only the name and address as printed on the card — the number itself is not collected.",
    fields: [
      { name: "nameOnAadhaar", label: "Name on Aadhaar", type: "text" },
      { name: "addressOnAadhaar", label: "Address on Aadhaar", type: "text", wide: true },
    ],
    uploads: [
      {
        docType: "AADHAAR",
        label: "Aadhaar card",
        hint: "Both sides · stored under a restricted prefix, every read logged",
      },
    ],
  },
  {
    key: "pan",
    title: "PAN details",
    blurb: "One of the four names the flag engine compares.",
    fields: [
      { name: "nameOnPan", label: "Name on PAN", type: "text" },
      { name: "panNumber", label: "PAN number", type: "mono", placeholder: "ABCPS1234F", maxLength: 10 },
    ],
    uploads: [{ docType: "PAN", label: "PAN card", hint: "Scan or clear photo" }],
  },
  {
    key: "bank",
    title: "Bank details",
    blurb: "Where the subsidy lands — it is credited to the customer, not to BHIM.",
    fields: [
      { name: "bankName", label: "Bank name", type: "combo", comboKey: "banks" },
      { name: "accountHolderName", label: "Account holder name", type: "text" },
      { name: "accountNumber", label: "Account number", type: "mono", maxLength: 20 },
      {
        name: "confirmAccountNumber",
        label: "Confirm account number",
        type: "mono",
        mask: true,
        maxLength: 20,
        hint: "Re-type it — this catches a mistyped digit before it reaches the bank file.",
      },
      { name: "ifscCode", label: "IFSC code", type: "mono", placeholder: "SBIN0001234", maxLength: 11 },
      {
        name: "occupation",
        label: "Occupation",
        type: "text",
        placeholder: "Farmer, shopkeeper, salaried…",
        hint: "The lender wants this on the loan file.",
        maxLength: 80,
      },
      {
        name: "hasCoApplicant",
        label: "Co-applicant on the loan?",
        type: "toggle",
        wide: true,
        hint: "Optional. Saying yes adds a section for their details and documents.",
      },
    ],
    uploads: [
      { docType: "CANCELLED_CHEQUE", label: "Cancelled cheque", hint: "Goes into the bank loan pack" },
      { docType: "BANK_STATEMENT", label: "Bank statement", hint: "Last six months · for the loan file" },
      { docType: "PASSBOOK", label: "Passbook photo", hint: "Alternative if there is no cheque book" },
    ],
    uploadsNote:
      "A cancelled cheque and a statement both go into the bank loan pack. A passbook photo stands in where the customer has no cheque book.",
  },
  {
    key: "electricity",
    title: "Electricity bill details",
    blurb: "Taken from the latest bill for this connection.",
    fields: [
      { name: "consumerNumber", label: "Consumer number", type: "mono", maxLength: 15 },
      {
        name: "nameOnBill",
        label: "Name on the bill",
        type: "text",
        hint: "Compared against Aadhaar, PAN and bank.",
        maxLength: 50,
      },
      {
        name: "sanctionedLoadKw",
        label: "Sanctioned load on the bill",
        type: "number",
        unit: "kW",
        hint: "Must be greater than the plant size, or a load enhancement is raised.",
      },
      { name: "currentBillAmount", label: "Current bill amount", type: "number", unit: "₹" },
    ],
    uploads: [
      {
        docType: "ELECTRICITY_BILL",
        label: "Electricity bill",
        hint: "The latest bill for this connection",
      },
    ],
  },
  {
    key: "other",
    title: "Other details",
    blurb: "Equipment choices that carry through to the documents.",
    fields: [
      { name: "panelType", label: "Panel type", type: "combo", comboKey: "panelTypes", placeholder: "Mono PERC" },
      {
        name: "panelCompany",
        label: "Panel company",
        type: "combo",
        comboKey: "panelCompanies",
        placeholder: "Waaree Energies Limited",
      },
      {
        name: "meterType",
        label: "Meter type",
        type: "select",
        options: ["", "Smart meter", "Normal meter"],
      },
    ],
  },
  {
    key: "survey",
    title: "Site survey",
    blurb: "Estimated runs. The actual lengths are recorded at stage 4.",
    fields: [
      { name: "acCableLengthM", label: "AC cable length", type: "number", unit: "m" },
      { name: "dcCableLengthM", label: "DC cable length", type: "number", unit: "m" },
      { name: "earthingLengthM", label: "Earthing length", type: "number", unit: "m" },
      { name: "laLengthM", label: "LA length", type: "number", unit: "m" },
      { name: "pipesRequired", label: "Pipes required", type: "number" },
    ],
  },
];

/**
 * Shown under the bank section only when it says there is a co-applicant.
 * Not one of the eight, and not counted towards "8 of 8".
 */
export const CO_APPLICANT_SECTION = {
  key: "coApplicant" as const,
  title: "Co-applicant",
  blurb: "The bank wants the same identity set from them as from the consumer.",
  fields: [
    { name: "name", label: "Full name", type: "text" as const },
    {
      name: "relationship",
      label: "Relationship to consumer",
      type: "text" as const,
      placeholder: "Spouse, son, daughter…",
    },
    { name: "phone", label: "Phone number", type: "mono" as const, maxLength: 10 },
    { name: "email", label: "Email address", type: "text" as const },
    { name: "occupation", label: "Occupation", type: "text" as const, maxLength: 80 },
    {
      name: "panNumber",
      label: "PAN number",
      type: "mono" as const,
      placeholder: "ABCPS1234F",
      maxLength: 10,
    },
  ],
  uploads: [
    { docType: "COAPP_AADHAAR", label: "Co-applicant Aadhaar card" },
    { docType: "COAPP_PAN", label: "Co-applicant PAN card" },
    { docType: "COAPP_PASSBOOK", label: "Co-applicant bank passbook" },
    {
      docType: "COAPP_PHOTO",
      label: "Co-applicant photographs",
      hint: "Scan on file; the bank wants two prints attached by hand",
    },
  ],
  uploadsNote:
    "The same set the bank asks for from the main applicant. These join the bank file automatically.",
} satisfies FormSection;

export function sectionByKey(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}
