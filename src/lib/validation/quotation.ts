import { z } from "zod";

/**
 * One schema for the quotation form and the action behind it.
 *
 * The amount is the field worth being strict about: it is what the customer
 * agrees to and what the agreement later copies, so a stray comma or an
 * empty box must fail here rather than print as "NaN/-" on a PDF someone
 * hands over a counter.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().or(z.literal(""));

export const quotationItemSchema = z.object({
  description: trimmed(300).min(1, "Every material row needs a description"),
  qty: optionalText(60),
  make: optionalText(120),
  remark: optionalText(400),
});

export const quotationMilestoneSchema = z.object({
  label: trimmed(200).min(1, "Every payment row needs a description"),
  schedule: trimmed(60).min(1, "Say what is due — a percentage or an amount"),
});

export const quotationScopeSchema = z.object({
  key: trimmed(60),
  byBhim: z.boolean(),
  byCustomer: z.boolean(),
});

export const quotationStatusValues = [
  "DRAFT",
  "ISSUED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
] as const;

export const systemTypeValues = ["ON_GRID", "OFF_GRID", "HYBRID"] as const;

export const quotationSchema = z.object({
  /** Present only when the quotation is raised from inside a project. */
  projectId: optionalText(60),

  consumerTitle: z.enum(["", "Mr.", "Mrs.", "M/s"]).default(""),
  consumerName: trimmed(160).min(1, "Who is this quotation for?"),
  consumerAddress: optionalText(400),
  consumerPhone: optionalText(40),

  quotationDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),

  capacityKwp: z
    .coerce.number({ invalid_type_error: "Capacity must be a number" })
    .positive("Capacity must be more than zero")
    .max(100, "That is past residential rooftop size — check the figure"),

  systemType: z.enum(systemTypeValues).default("ON_GRID"),
  meteringPolicy: trimmed(160).min(1, "The subject line needs a metering policy"),

  totalAmount: z
    .coerce.number({ invalid_type_error: "The amount must be a number" })
    .positive("The amount must be more than zero")
    .max(100_000_000, "Check the amount — that is over a crore"),

  // Dropdown selections. Only used to seed the material rows, so none of
  // them is required: a quotation can be typed out by hand.
  structureMake: optionalText(120),
  panelCompany: optionalText(120),
  panelModel: optionalText(120),
  panelWattPeak: z.coerce.number().int().positive().max(2000).nullable().optional(),
  panelCount: z.coerce.number().int().positive().max(500).nullable().optional(),
  inverterMake: optionalText(120),
  inverterModel: optionalText(120),

  notes: optionalText(600),

  items: z.array(quotationItemSchema).min(1, "A quotation needs at least one material row"),
  milestones: z
    .array(quotationMilestoneSchema)
    .min(1, "A quotation needs a payment schedule"),
  scope: z.array(quotationScopeSchema).default([]),
});

export type QuotationInput = z.infer<typeof quotationSchema>;
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
export type QuotationMilestoneInput = z.infer<typeof quotationMilestoneSchema>;

/**
 * Changing the status of an existing quotation.
 *
 * Separate from the form schema because marking one ACCEPTED is a different
 * act from editing it, and the two must not be possible in one request.
 */
export const quotationStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(quotationStatusValues),
});

/**
 * Attaching a quotation to a project, or taking it off one.
 *
 * Its own schema, and its own action, because it is not an edit of the
 * offer: nothing the customer reads changes, but the file moves into (or out
 * of) a project's document library and the bank pack. An empty `projectId`
 * detaches.
 */
export const quotationLinkSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().trim().max(60),
});

/**
 * Making one of a project's quotations the chosen offer.
 *
 * Its own schema again: choosing is neither an edit nor an attach, and it is
 * the act that decides which price reaches the bank file.
 */
export const quotationChooseSchema = z.object({
  id: z.string().min(1),
});
