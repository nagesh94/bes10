import { z } from "zod";
import { isValidIfsc, isValidPan } from "@/lib/crypto/field";
import { dateNotFuture, pinCodeSchema, phoneSchema } from "./lead";

/**
 * The eight sections of the stage 1 prospect form.
 *
 * Each section validates on its own so it can be saved and marked complete
 * independently — which is how the form behaves. The same schemas run on the
 * client and inside the server action; a field is never checked twice with
 * two different rules.
 *
 * Everything is optional while a section is a draft. `requiredFor` below says
 * what a section needs before it counts as complete.
 */

export const SECTION_KEYS = [
  "user",
  "rooftop",
  "aadhaar",
  "pan",
  "bank",
  "electricity",
  "other",
  "survey",
] as const;

/** Conditional: not one of the eight, and not counted in "8 of 8". */
export const CONDITIONAL_SECTION_KEYS = ["coApplicant"] as const;
export type ConditionalSectionKey = (typeof CONDITIONAL_SECTION_KEYS)[number];

export type SectionKey = (typeof SECTION_KEYS)[number];

const optionalText = (max = 200) => z.string().trim().max(max).optional().or(z.literal(""));

/** A decimal typed into a text box: "4.82" → 4.82, "" → undefined. */
const decimal = (label: string, max = 100000) =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= max), {
      message: `${label} must be a number`,
    });

export const userSectionSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: optionalText(80),
  gender: optionalText(20),
  phone: phoneSchema,
  email: z.string().trim().email("That does not look like an email address").optional().or(z.literal("")),
  address: optionalText(400),
  pinCode: pinCodeSchema.optional().or(z.literal("")),
  nationalPortalId: optionalText(60),
  applicationDate: dateNotFuture("Application date"),
  regionName: optionalText(80),
  circleName: optionalText(80),
  divisionName: optionalText(80),
  zoneName: optionalText(80),
  isDcr: z.boolean().default(true),
  wantsSubsidy: z.boolean().default(true),
});

export const rooftopSectionSchema = z.object({
  plantKw: decimal("Plant size", 1000),
  latitude: decimal("Latitude", 90),
  longitude: decimal("Longitude", 180),
});

/**
 * The Aadhaar number itself is never collected — only the name and address
 * as printed on the card, plus the upload. `identityAadhaar.aadhaarNumber*`
 * columns stay in the schema unused rather than being migrated out.
 */
export const aadhaarSectionSchema = z.object({
  nameOnAadhaar: optionalText(120),
  addressOnAadhaar: optionalText(400),
});

export const panSectionSchema = z.object({
  nameOnPan: optionalText(120),
  panNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidPan(v), {
      message: "A PAN is five letters, four digits, then a letter",
    }),
});

const ifscField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || isValidIfsc(v), {
    message: "An IFSC is four letters, a zero, then six characters",
  });

const panField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || isValidPan(v), {
    message: "A PAN is five letters, four digits, then a letter",
  });

const accountNumberField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^[0-9]{6,20}$/.test(v), {
    message: "An account number is 6 to 20 digits",
  });

export const bankSectionSchema = z
  .object({
    bankName: optionalText(120),
    accountHolderName: optionalText(120),
    accountNumber: accountNumberField,
    confirmAccountNumber: accountNumberField,
    ifscCode: ifscField,
    occupation: optionalText(80),
    hasCoApplicant: z.boolean().default(false),
  })
  .refine((v) => !v.accountNumber || v.accountNumber === v.confirmAccountNumber, {
    message: "Account numbers do not match",
    path: ["confirmAccountNumber"],
  });

/**
 * The co-applicant on the loan.
 *
 * Only asked for when the bank section says there is one. The bank wants the
 * same identity set from them as from the consumer.
 */
export const coApplicantSectionSchema = z.object({
  name: optionalText(120),
  relationship: optionalText(60),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ?? "").replace(/^(\+?91[\s-]?)|^0/, "").replace(/[\s()-]/g, ""))
    .refine((v) => !v || /^[6-9][0-9]{9}$/.test(v), {
      message: "Enter a 10-digit mobile number",
    }),
  email: z.string().trim().email("That does not look like an email address").optional().or(z.literal("")),
  occupation: optionalText(80),
  panNumber: panField,
  // Same policy as the main applicant: the Aadhaar number itself is never
  // collected, only the name and the upload.
});

export const electricitySectionSchema = z.object({
  consumerNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^[0-9]{6,15}$/.test(v), {
      message: "A consumer number is 6 to 15 digits",
    }),
  nameOnBill: optionalText(50),
  sanctionedLoadKw: decimal("Sanctioned load", 1000),
  currentBillAmount: decimal("Bill amount", 10_000_000),
});

export const meterTypeValues = ["", "Smart meter", "Normal meter"] as const;

export const otherSectionSchema = z.object({
  panelType: optionalText(60),
  panelCompany: optionalText(120),
  meterType: z.enum(meterTypeValues).default(""),
});

export const surveySectionSchema = z.object({
  acCableLengthM: decimal("AC cable length"),
  dcCableLengthM: decimal("DC cable length"),
  earthingLengthM: decimal("Earthing length"),
  laLengthM: decimal("LA length"),
  pipesRequired: decimal("Pipes required", 1000),
});

export const sectionSchemas = {
  user: userSectionSchema,
  rooftop: rooftopSectionSchema,
  aadhaar: aadhaarSectionSchema,
  pan: panSectionSchema,
  bank: bankSectionSchema,
  electricity: electricitySectionSchema,
  other: otherSectionSchema,
  survey: surveySectionSchema,
  coApplicant: coApplicantSectionSchema,
} as const;

/**
 * What each section needs before it counts towards "8 of 8".
 *
 * Saving a partial section is always allowed — the field team fills these in
 * over days, from documents that arrive at different times.
 */
export const requiredFor: Record<SectionKey | ConditionalSectionKey, string[]> = {
  user: ["firstName", "phone", "nationalPortalId"],
  rooftop: ["plantKw"],
  aadhaar: ["nameOnAadhaar"],
  pan: ["nameOnPan", "panNumber"],
  bank: ["bankName", "accountHolderName", "accountNumber", "ifscCode"],
  electricity: ["consumerNumber", "nameOnBill", "sanctionedLoadKw"],
  other: ["panelCompany"],
  survey: ["acCableLengthM", "dcCableLengthM", "earthingLengthM"],
  // Only reached when the bank section says there is a co-applicant.
  coApplicant: ["name", "phone", "panNumber"],
};

export function isSectionComplete(
  key: SectionKey | ConditionalSectionKey,
  values: Record<string, unknown>,
): boolean {
  return requiredFor[key].every((field) => {
    const v = values[field];
    return v !== null && v !== undefined && String(v).trim() !== "";
  });
}
