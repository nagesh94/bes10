import { z } from "zod";

/**
 * One schema, used by the form, the server action and any import.
 * A field is never validated twice with two different rules.
 */

/**
 * An Indian mobile number: exactly 10 digits once formatting is stripped.
 * Office staff sometimes paste it with spaces, a leading +91 or a 0 — those
 * are stripped before the length check, so "+91 98765 43210" still passes.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^(\+?91[\s-]?)|^0/, "").replace(/[\s()-]/g, ""))
  .refine((v) => /^[6-9][0-9]{9}$/.test(v), {
    message: "Enter a 10-digit mobile number",
  });

export const pinCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, "An Indian PIN code is 6 digits and cannot start with 0");

/**
 * A date typed into a date field that may not be in the future — an
 * application date, an installation date, a payment date. Blank is always
 * allowed; a section is a draft until it is complete.
 *
 * Commissioning is the one date in the app that is deliberately booked
 * ahead, so it is never built with this helper.
 */
export const dateNotFuture = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => {
        if (!v) return true;
        const d = new Date(`${v}T00:00:00`);
        if (Number.isNaN(d.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d.getTime() <= today.getTime();
      },
      { message: `${label} cannot be after today` },
    );

export const leadSourceValues = [
  "WALK_IN",
  "REFERRAL",
  "WEBSITE",
  "CAMPAIGN",
  "OTHER",
] as const;

export const newLeadSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().max(80).optional().or(z.literal("")),
    phone: phoneSchema,
    email: z.string().trim().email("That does not look like an email address").optional().or(z.literal("")),
    address: z.string().trim().max(400).optional().or(z.literal("")),
    pinCode: pinCodeSchema.optional().or(z.literal("")),
    interestedPlantKw: z.string().trim().max(20).optional().or(z.literal("")),
    leadSource: z.enum(leadSourceValues).default("WALK_IN"),
    // Set only for REFERRAL — the partner who sent this lead in.
    partnerId: z.string().trim().optional().or(z.literal("")),
    assignedEmployeeId: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.leadSource !== "REFERRAL" || !!v.partnerId, {
    message: "Pick the referring channel partner",
    path: ["partnerId"],
  });

export type NewLeadInput = z.infer<typeof newLeadSchema>;

/**
 * A lead becomes a prospect once the application exists on the national
 * portal. The ID is the gate — without it there is nothing to convert into.
 */
export const convertToProspectSchema = z.object({
  projectId: z.string().min(1),
  nationalPortalId: z
    .string()
    .trim()
    .min(6, "Paste the application ID from the PM Surya Ghar portal")
    .max(60),
});

export type ConvertToProspectInput = z.infer<typeof convertToProspectSchema>;
