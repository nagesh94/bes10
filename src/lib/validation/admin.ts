import { z } from "zod";
import { ROLES } from "@/lib/rbac/permissions";

/**
 * One schema per admin form, shared by the screen and the server action.
 */

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "That password is too long");

const phoneField = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+\-\s()]*$/, "Only digits, spaces and + - ( ) are allowed")
  .optional()
  .or(z.literal(""));

/**
 * At least one role. An account with none would sign in and then be refused
 * everywhere, which reads as a broken app rather than a disabled one —
 * disabling is what `active` is for.
 */
const rolesField = z
  .array(z.enum(ROLES))
  .min(1, "Give them at least one role")
  .max(ROLES.length)
  // The same role twice is a double-click, not an error worth a message.
  .transform((roles) => [...new Set(roles)]);

const partnerIdField = z.string().trim().max(60).nullish();

/**
 * A PARTNER role is scoped to a partner record: every permission it carries
 * is `own`, matched against `partnerId`. Without one the person signs in to
 * an empty page, so the link is required rather than merely advised.
 */
function requirePartnerLink<T extends { roles: string[]; partnerId?: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (value.roles.includes("PARTNER") && !value.partnerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["partnerId"],
      message: "Choose the partner record this login belongs to",
    });
  }
}

export const inviteUserSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the person's name").max(80),
    email: z.string().trim().email("That does not look like an email address").max(160),
    roles: rolesField,
    phone: phoneField,
    partnerId: partnerIdField,
    password: passwordSchema,
  })
  .superRefine(requirePartnerLink);

export type InviteUserInput = z.input<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2, "Enter the person's name").max(80),
    roles: rolesField,
    phone: phoneField,
    partnerId: partnerIdField,
    active: z.boolean(),
    password: passwordSchema.optional().or(z.literal("")),
  })
  .superRefine(requirePartnerLink);

export type UpdateUserInput = z.input<typeof updateUserSchema>;

/** The row's enable/disable switch, which carries nothing else. */
export const setUserActiveSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

/** Resetting a forgotten password, on its own — it changes nothing else. */
export const resetPasswordSchema = z.object({
  id: z.string().min(1),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const nameField = z.string().trim().min(1, "Name is required").max(120);

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Enter a full http(s) URL, or leave it blank");

export const addMasterSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("panel-companies"), name: nameField }),
  z.object({ category: z.literal("panel-types"), name: nameField }),
  z.object({
    category: z.literal("panel-models"),
    companyId: z.coerce.number().int().positive("Choose a company"),
    modelNo: z.string().trim().min(1, "Model number is required").max(80),
    wattPeak: z.coerce.number().int().positive("Watt-peak is required").max(2000),
    isDcr: z.boolean(),
  }),
  z.object({
    category: z.literal("inverters"),
    manufacturer: nameField,
    brandName: z.string().trim().max(120).optional().or(z.literal("")),
    modelNo: z.string().trim().min(1, "Model number is required").max(80),
    capacityKw: z.coerce.number().positive("Capacity is required").max(100),
  }),
  z.object({ category: z.literal("structures"), name: nameField }),
  z.object({ category: z.literal("cable-makes"), name: nameField }),
  z.object({ category: z.literal("banks"), name: nameField }),
  z.object({
    category: z.literal("plant-sizes"),
    kw: z.coerce.number().positive("Size is required").max(100),
    label: z.string().trim().max(40).optional().or(z.literal("")),
  }),
  z.object({
    category: z.literal("discom"),
    divisionId: z.coerce.number().int().positive("Choose a division"),
    name: nameField,
  }),
]);

export type AddMasterInput = z.infer<typeof addMasterSchema>;

export const setMasterActiveSchema = z.object({
  category: z.enum([
    "panel-companies",
    "panel-types",
    "panel-models",
    "inverters",
    "structures",
    "cable-makes",
    "banks",
    "plant-sizes",
  ]),
  id: z.coerce.number().int().positive(),
  active: z.boolean(),
});

export type SetMasterActiveInput = z.infer<typeof setMasterActiveSchema>;

export const discomLinksSchema = z.object({
  id: z.coerce.number().int().positive(),
  nameChangeUrl: optionalUrl,
  loadEnhancementUrl: optionalUrl,
  meterPortalUrl: optionalUrl,
  landRecordsUrl: optionalUrl,
});

export type DiscomLinksInput = z.infer<typeof discomLinksSchema>;

export const removeZoneSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const TEMPLATE_ENGINES = ["DOCX", "PDF_FORM", "PDF_OVERLAY"] as const;

export const uploadTemplateSchema = z.object({
  name: z.string().trim().min(2, "Give the template a name").max(140),
  docType: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,40}$/, "Use a code like AGREEMENT"),
  engine: z.enum(TEMPLATE_ENGINES),
  onLetterhead: z.boolean(),
});

export type UploadTemplateInput = z.infer<typeof uploadTemplateSchema>;
