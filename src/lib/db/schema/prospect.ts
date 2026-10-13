import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./core";
import { user } from "./auth";
import { flagStatusEnum, flagTypeEnum } from "./enums";

/**
 * Stage 1 — the prospect form, one table per section.
 *
 * Split by section rather than one wide table so each section can be saved,
 * validated and marked complete on its own, which is what the form does.
 */

export const applicationDetails = pgTable(
  "application_details",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** From PM Surya Ghar, e.g. NP-MPMK26-14534479. Prints into every document. */
    nationalPortalId: text("national_portal_id"),
    applicationDate: date("application_date"),
    sanctionDate: date("sanction_date"),

    // Resolved from master data, but stored per project: a Bhopal job must
    // print Bhopal addressing even after the company opens another branch.
    discomCompanyId: integer("discom_company_id"),
    regionName: text("region_name"),
    circleName: text("circle_name"),
    divisionName: text("division_name"),
    zoneName: text("zone_name"),

    isDcr: boolean("is_dcr").notNull().default(true),
    wantsSubsidy: boolean("wants_subsidy").notNull().default(true),
    completedAt: timestamp("completed_at"),
  },
);

export const rooftopDetails = pgTable("rooftop_details", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  plantKw: numeric("plant_kw", { precision: 6, scale: 2 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  completedAt: timestamp("completed_at"),
});

/**
 * Aadhaar number is stored encrypted; only the last four are kept in clear for
 * display. Every read of the document is written to the audit log.
 */
export const identityAadhaar = pgTable("identity_aadhaar", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  nameOnAadhaar: text("name_on_aadhaar"),
  addressOnAadhaar: text("address_on_aadhaar"),
  aadhaarLast4: text("aadhaar_last4"),
  aadhaarEncrypted: text("aadhaar_encrypted"),
  completedAt: timestamp("completed_at"),
});

export const identityPan = pgTable("identity_pan", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  nameOnPan: text("name_on_pan"),
  panNumber: text("pan_number"),
  completedAt: timestamp("completed_at"),
});

export const bankAccounts = pgTable("bank_accounts", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  bankName: text("bank_name"),
  accountHolderName: text("account_holder_name"),
  accountNumber: text("account_number"),
  ifscCode: text("ifsc_code"),
  /** Asked up front — the lender wants it on the loan file. */
  occupation: text("occupation"),
  /** Optional on a loan; when true, `co_applicants` carries their details. */
  hasCoApplicant: boolean("has_co_applicant").notNull().default(false),
  completedAt: timestamp("completed_at"),
});

/**
 * A co-applicant on the loan.
 *
 * Optional, and only meaningful on a financed project. The bank wants the
 * same identity set from them as from the consumer, so their documents go
 * into the bank file alongside the main applicant's.
 */
export const coApplicants = pgTable("co_applicants", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name"),
  relationship: text("relationship"),
  phone: text("phone"),
  email: text("email"),
  occupation: text("occupation"),
  panNumber: text("pan_number"),
  /** Same treatment as the consumer's: last four clear, the rest encrypted. */
  aadhaarLast4: text("aadhaar_last4"),
  aadhaarEncrypted: text("aadhaar_encrypted"),
  completedAt: timestamp("completed_at"),
});

export const electricityConnections = pgTable("electricity_connections", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  consumerNumber: text("consumer_number"),
  /** The name as printed on the bill — one of the four the flag engine compares. */
  nameOnBill: text("name_on_bill"),
  sanctionedLoadKw: numeric("sanctioned_load_kw", { precision: 6, scale: 2 }),
  currentBillAmount: numeric("current_bill_amount", { precision: 12, scale: 2 }),
  completedAt: timestamp("completed_at"),
});

export const otherDetails = pgTable("other_details", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  panelType: text("panel_type"),
  panelCompany: text("panel_company"),
  panelModelNo: text("panel_model_no"),
  meterType: text("meter_type"),
  completedAt: timestamp("completed_at"),
});

export const siteSurveys = pgTable("site_surveys", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  expectedWireLengthM: numeric("expected_wire_length_m", { precision: 8, scale: 2 }),
  acCableLengthM: numeric("ac_cable_length_m", { precision: 8, scale: 2 }),
  dcCableLengthM: numeric("dc_cable_length_m", { precision: 8, scale: 2 }),
  earthingLengthM: numeric("earthing_length_m", { precision: 8, scale: 2 }),
  laLengthM: numeric("la_length_m", { precision: 8, scale: 2 }),
  pipesRequired: integer("pipes_required"),
  surveyedBy: text("surveyed_by").references(() => user.id),
  surveyedOn: date("surveyed_on"),
  completedAt: timestamp("completed_at"),
});

/* ──────────────────────────────────────────────────────────────────────────
   Flags
   ────────────────────────────────────────────────────────────────────────── */

export const flags = pgTable(
  "flags",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: flagTypeEnum("type").notNull(),
    status: flagStatusEnum("status").notNull().default("OPEN"),
    /** The engine's own output, kept so the UI can show what it compared. */
    detail: text("detail"),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at"),
    /** Required when an admin waives rather than resolves. */
    waiverReason: text("waiver_reason"),
  },
  (t) => [
    uniqueIndex("flags_project_type_idx").on(t.projectId, t.type),
    index("flags_status_idx").on(t.status),
  ],
);

export const nameChangeRequests = pgTable("name_change_requests", {
  flagId: integer("flag_id")
    .primaryKey()
    .references(() => flags.id, { onDelete: "cascade" }),
  applicantPhotoDocId: text("applicant_photo_doc_id"),
  khasraNumber: text("khasra_number"),
  /** Prepared outside the app and uploaded, like the quotation. */
  nocDocumentId: text("noc_document_id"),
  submittedAt: timestamp("submitted_at"),
  completedAt: timestamp("completed_at"),
});

export const loadChangeRequests = pgTable("load_change_requests", {
  flagId: integer("flag_id")
    .primaryKey()
    .references(() => flags.id, { onDelete: "cascade" }),
  currentSanctionedKw: numeric("current_sanctioned_kw", { precision: 6, scale: 2 }),
  requiredKw: numeric("required_kw", { precision: 6, scale: 2 }),
  /** DISCOM acknowledgement, e.g. LESA/LE/2026/22418 */
  acknowledgementNo: text("acknowledgement_no"),
  appliedAt: timestamp("applied_at"),
  approvedAt: timestamp("approved_at"),
  newSanctionedKw: numeric("new_sanctioned_kw", { precision: 6, scale: 2 }),
});
