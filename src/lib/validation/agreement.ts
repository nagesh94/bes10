import { z } from "zod";

/**
 * One schema for the agreement form and the actions behind it.
 *
 * The cost is the field worth being strict about. It prints inside clause
 * 19.1 of a document that goes to a notary, so an empty box or a stray
 * comma must fail here rather than reach the paper as "Rs. NaN".
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().or(z.literal(""));

export const agreementStatusValues = ["DRAFT", "ISSUED", "SIGNED", "CANCELLED"] as const;

/** One line of clause 19.1 (i)(ii)(iii). */
export const agreementMilestoneSchema = z.object({
  label: trimmed(200).min(1, "Say what this instalment is for"),
  amount: z.coerce
    .number({ invalid_type_error: "Each instalment must be a number" })
    .nonnegative("An instalment cannot be negative")
    .max(100_000_000, "Check the figure — that is over a crore"),
});

export const agreementSchema = z.object({
  /** Present only when the agreement is drawn up from inside a project. */
  projectId: optionalText(60),

  consumerTitle: z.enum(["", "Mr.", "Mrs.", "M/s"]).default(""),
  consumerName: trimmed(160).min(1, "Who is this agreement with?"),
  // Required, unlike on a quotation: the address is recited in the opening
  // paragraph and again in the signature block of a legal document.
  consumerAddress: trimmed(400).min(1, "The agreement recites the first party's address"),

  executionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date of execution"),

  totalValue: z.coerce
    .number({ invalid_type_error: "The cost must be a number" })
    .positive("Clause 19.1 states a cost — it must be more than zero")
    .max(100_000_000, "Check the amount — that is over a crore"),

  /** "plan" | "quotation" | "typed" — recorded, never trusted from the client. */
  valueSource: optionalText(20),

  milestones: z
    .array(agreementMilestoneSchema)
    .min(1, "Clause 19.1 needs at least one instalment"),
});

export type AgreementInput = z.infer<typeof agreementSchema>;
export type AgreementMilestoneInput = z.infer<typeof agreementMilestoneSchema>;

/**
 * Changing the status of an existing agreement.
 *
 * Separate from the form schema because marking one SIGNED is a different
 * act from editing its terms, and the two must not be possible in one
 * request.
 */
export const agreementStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(agreementStatusValues),
});

/** Attaching an agreement to a project, moving it, or taking it off one. */
export const agreementLinkSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().trim().max(60),
});

/** Making one of a project's agreements the one that is filed. */
export const agreementPrimarySchema = z.object({
  id: z.string().min(1),
});
