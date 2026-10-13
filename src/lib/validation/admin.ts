import { z } from "zod";
import { ROLES } from "@/lib/rbac/permissions";

/**
 * One schema per admin form, shared by the screen and the server action.
 */

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "That password is too long");

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name").max(80),
  email: z.string().trim().email("That does not look like an email address").max(160),
  role: z.enum(ROLES),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s()]*$/, "Only digits, spaces and + - ( ) are allowed")
    .optional()
    .or(z.literal("")),
  password: passwordSchema,
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Enter the person's name").max(80),
  role: z.enum(ROLES),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s()]*$/, "Only digits, spaces and + - ( ) are allowed")
    .optional()
    .or(z.literal("")),
  active: z.boolean(),
  password: passwordSchema.optional().or(z.literal("")),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

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
