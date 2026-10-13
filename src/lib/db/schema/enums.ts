import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "EMPLOYEE", "INSTALLER", "PARTNER"]);

export const localeEnum = pgEnum("locale", ["en", "hi"]);
export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);

/** Lead → Prospect → Customer. One row throughout; this is a status. */
export const lifecycleEnum = pgEnum("lifecycle_stage", ["LEAD", "PROSPECT", "CUSTOMER"]);

export const segmentEnum = pgEnum("segment", ["RESIDENTIAL"]);

export const stageStatusEnum = pgEnum("stage_status", [
  "not_started",
  "in_progress",
  "blocked",
  "complete",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "CONTACTED",
  "SURVEY_DONE",
  "READY_TO_CONVERT",
  "LOST",
]);

export const flagTypeEnum = pgEnum("flag_type", ["NAME_MISMATCH", "LOAD_ENHANCEMENT"]);
export const flagStatusEnum = pgEnum("flag_status", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "WAIVED",
]);

export const paymentModeEnum = pgEnum("payment_mode", ["CASH", "FINANCE", "SPLIT"]);

export const milestoneTriggerEnum = pgEnum("milestone_trigger", [
  "UPFRONT",
  "ON_INSTALL",
  "POST_SUBSIDY",
  "ON_LOAN_DISBURSAL",
]);

export const paymentModeReceivedEnum = pgEnum("payment_received_mode", [
  "CASH",
  "UPI",
  "CHEQUE",
  "NEFT",
  "LOAN_DISBURSAL",
]);

export const subsidyStatusEnum = pgEnum("subsidy_status", [
  "NOT_APPLIED",
  "APPLIED",
  "APPROVED",
  "RECEIVED",
]);

export const financeStatusEnum = pgEnum("finance_status", [
  "NOT_APPLIED",
  "APPLIED",
  "SANCTIONED",
  "DISBURSED",
  "REJECTED",
]);

/** Column, rafter and purlin are the same shape: many runs, each its own size. */
export const structureMemberEnum = pgEnum("structure_member_type", [
  "COLUMN",
  "RAFTER",
  "PURLIN",
]);

export const inverterPhaseEnum = pgEnum("inverter_phase", ["SINGLE", "THREE"]);

export const cableCategoryEnum = pgEnum("cable_category", ["AC", "DC", "LA", "EARTHING"]);

export const docClassEnum = pgEnum("document_class", [
  "COLLECTED",
  "GENERATED",
  "EXECUTED",
  "EVIDENCE",
  "EXTERNAL",
  /** An object, not a file — passport photos, cheques, stamp paper. */
  "PHYSICAL",
]);

export const docStatusEnum = pgEnum("document_status", [
  "PENDING",
  "GENERATED",
  "PRINTED",
  "SIGNED",
  "SCANNED",
  "UPLOADED_TO_PORTAL",
  "VERIFIED",
  "REJECTED",
]);

export const templateEngineEnum = pgEnum("template_engine", [
  "DOCX",
  "PDF_FORM",
  "PDF_OVERLAY",
]);

export const photoTypeEnum = pgEnum("photo_type", [
  "CUSTOMER_WITH_PANEL",
  "CUSTOMER_WITH_INVERTER",
  "EARTHING_AC",
  "EARTHING_DC",
  "EARTHING_PIT",
  "SITE_OVERVIEW",
  "SITE_SURVEY",
]);

export const commissionBasisEnum = pgEnum("commission_basis", [
  "PER_KW",
  "FLAT_PER_PROJECT",
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "ACCRUED",
  "DUE",
  "PAID",
  "CANCELLED",
]);

/**
 * A quotation is DRAFT until it is issued to the customer. Issuing freezes
 * it: the number is already spent, and the paper may be in someone's hands.
 */
export const quotationStatusEnum = pgEnum("quotation_status", [
  "DRAFT",
  "ISSUED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
]);

/** What is being offered. Changes only the subject line and the inverter row. */
export const systemTypeEnum = pgEnum("system_type", ["ON_GRID", "OFF_GRID", "HYBRID"]);

/**
 * An agreement's life on paper.
 *
 * DRAFT is the .docx the app builds; ISSUED means it has gone to the lawyer
 * or the customer for the hard copy; SIGNED records that the wet-signed,
 * notarised scan has come back and been uploaded as its own document — the
 * app never signs anything. CANCELLED keeps a draft that came to nothing
 * rather than deleting it, so the file is still explicable later.
 */
export const agreementStatusEnum = pgEnum("agreement_status", [
  "DRAFT",
  "ISSUED",
  "SIGNED",
  "CANCELLED",
]);
