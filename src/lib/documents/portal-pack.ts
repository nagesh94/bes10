import type { DocType } from "./types";

/**
 * What goes up to the PM Surya Ghar portal, defined once.
 *
 * This replaces counting every row in `documents`, which was wrong: a bank
 * statement is collected for the loan and the portal never wants it, so
 * counting it made the stage 7 gate unreachable on a financed project. The
 * gate now counts this list and nothing else.
 *
 * Order is the order the portal's own upload screen asks for them in, so
 * someone working down the page is working down the portal.
 */

export interface PortalPackItem {
  docType: DocType;
  label: string;
  /** Why the portal wants it — shown under the row. */
  hint: string;
  /** DCR-only items are skipped on a non-DCR project. */
  dcrOnly?: boolean;
}

const PORTAL_PACK: PortalPackItem[] = [
  {
    docType: "WORK_COMPLETION",
    label: "Work completion report",
    hint: "Generated here, printed, signed by installer and applicant, scanned",
  },
  {
    docType: "JOINT_INSPECTION",
    label: "Joint inspection report",
    hint: "Generated here; the DISCOM signs its column at inspection",
  },
  {
    docType: "ALMM_DECLARATION",
    label: "ALMM declaration",
    hint: "Generated on letterhead, signed by the proprietor",
  },
  {
    docType: "DCR_UNDERTAKING",
    label: "DCR undertaking (Annexure-I)",
    hint: "Generated here, signed by the proprietor",
    dcrOnly: true,
  },
  {
    docType: "DCR_CERTIFICATE",
    label: "DCR certificate",
    hint: "Raised on the NISE portal at stage 5",
    dcrOnly: true,
  },
  {
    docType: "AGREEMENT_SIGNED",
    label: "Vendor agreement — signed scan",
    hint: "The wet-signed copy from stage 2",
  },
  {
    docType: "METER_RECEIPT",
    label: "Meter payment receipt",
    hint: "Paid on the DISCOM portal at stage 6",
  },
];

/**
 * The pack for one project.
 *
 * A non-DCR project has no domestic content paperwork — those two rows do
 * not exist for it rather than sitting there unticked forever.
 */
export function portalPackFor(isDcr: boolean): PortalPackItem[] {
  return PORTAL_PACK.filter((item) => (item.dcrOnly ? isDcr : true));
}

/**
 * Everything this app produces from a template, and the stage it belongs to.
 *
 * Stage 7 is the submission pack. The commissioning certificate is stage 8
 * because it cannot be written until the net meter is in and the performance
 * check has been done — generating it earlier would print a blank date into
 * a certificate that says the system was checked.
 */
export const GENERATED_DOCS = {
  7: [
    "WORK_COMPLETION",
    "JOINT_INSPECTION",
    "ALMM_DECLARATION",
    "DCR_UNDERTAKING",
    "COMMISSIONING_CERT",
    "SUBMISSION_PACK",
  ],
  8: ["COMMISSIONING_CERT"],
} as const satisfies Record<number, readonly DocType[]>;

/**
 * What goes into the submission pack, and in what order (added 13 Oct 2026,
 * dictated by the user — work completion before joint inspection, not
 * generation order or the portal's own order above).
 *
 * `generate.ts`'s `buildSubmissionPack` reads this list, rendering or
 * fetching each one and skipping `DCR_UNDERTAKING` on a non-DCR project.
 */
export const SUBMISSION_PACK_ORDER: readonly DocType[] = [
  "METER_RECEIPT",
  "ALMM_DECLARATION",
  "DCR_UNDERTAKING",
  "WORK_COMPLETION",
  "JOINT_INSPECTION",
  "COMMISSIONING_CERT",
];

export type GeneratedDocType =
  | (typeof GENERATED_DOCS)[7][number]
  | (typeof GENERATED_DOCS)[8][number];

/** Kept as the old name so existing call sites read unchanged. */
export type Stage7DocType = GeneratedDocType;

/** Which of a stage's documents apply to this project. */
export function generatedSetFor(isDcr: boolean, stage: 7 | 8 = 7): GeneratedDocType[] {
  return [...GENERATED_DOCS[stage]].filter((t) => (t === "DCR_UNDERTAKING" ? isDcr : true));
}

/**
 * Every doc type `regenerateGeneratedDocument` (`src/app/actions/documents.ts`)
 * knows how to rebuild from a project's current data — the stage 7/8 set plus
 * the vendor agreement, which is rebuilt by the agreement maker
 * (`src/app/actions/agreements.ts`) rather than `generateDocument`: it is
 * built from the agreement the parties settled, so rebuilding means
 * re-rendering the project's filed agreement, not re-reading the project.
 *
 * QUOTATION is deliberately excluded even though it is also `class:
 * "GENERATED"` — a quotation's PDF is rebuilt from the quotation page
 * ("Rebuild PDF"), which keeps its number and status; regenerating it from
 * the documents list would bypass that and has no way to know which
 * quotation row to rebuild from.
 */
export function isRegenerableDocType(docType: string): docType is GeneratedDocType | "AGREEMENT" {
  return (
    docType === "AGREEMENT" ||
    GENERATED_DOCS[7].includes(docType as never) ||
    GENERATED_DOCS[8].includes(docType as never)
  );
}

/**
 * The fields the stage 7/8 gate requires before anything can be generated.
 *
 * Added 12 Oct 2026, overriding the earlier "blank line, fill in by hand"
 * design. Narrowed 13 Oct 2026: the date of commissioning is the only
 * inspection date the gate checks — the user treats it as the same date as
 * the performance check, and joint inspection happens separately at the
 * DISCOM's own pace and was never meant to block generation. The module
 * procurement fields on a DCR project are still required, except the cell
 * GST invoice number, which is collected but optional. It is a plain
 * function rather than living in `generate.ts` so a page component can show
 * the same missing-field list the server action would reject — `generate.ts`
 * is a `"use server"` module and may only export async functions.
 */
export interface GateInputs {
  commissioningDate: unknown;
  isDcr: boolean;
  purchaseOrderNo: unknown;
  purchaseOrderDate: unknown;
  cellManufacturer: unknown;
}

export function gateMissingFields(input: GateInputs): string[] {
  const missing: string[] = [];
  if (!input.commissioningDate) missing.push("date of commissioning");
  if (input.isDcr) {
    if (!input.purchaseOrderNo) missing.push("purchase order number");
    if (!input.purchaseOrderDate) missing.push("purchase order date");
    if (!input.cellManufacturer) missing.push("cell manufacturer");
    // Cell GST invoice number is collected but optional — not every cell
    // purchase has one on hand at generation time.
  }
  return missing;
}
