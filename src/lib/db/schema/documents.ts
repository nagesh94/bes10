import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { projects } from "./core";
import { user } from "./auth";
import { docClassEnum, docStatusEnum, photoTypeEnum } from "./enums";

/**
 * Every file in the system.
 *
 * Three variants per upload: `original` is never touched and is what prints;
 * `portal` is squeezed under the government portal's size cap; `thumb` is for
 * listings. Shrinking a file to satisfy a portal limit happens on the server,
 * not on someone's phone at the counter.
 */
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    docType: text("doc_type").notNull(),
    docClass: docClassEnum("doc_class").notNull(),
    status: docStatusEnum("status").notNull().default("PENDING"),

    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    pageCount: integer("page_count"),

    s3KeyOriginal: text("s3_key_original"),
    s3KeyPortal: text("s3_key_portal"),
    s3KeyThumb: text("s3_key_thumb"),

    /** A scanned wet-signed copy points at the generated original it replaces
        in the bank file — but never deletes it. */
    signedCopyOf: text("signed_copy_of"),
    supersedesId: text("supersedes_id"),

    templateId: integer("template_id"),
    templateVersion: integer("template_version"),
    generatedAt: timestamp("generated_at"),

    uploadedBy: text("uploaded_by").references(() => user.id),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    portalUploadedAt: timestamp("portal_uploaded_at"),
    verifiedBy: text("verified_by").references(() => user.id),
    verifiedAt: timestamp("verified_at"),

    /** Set by a regeneration — who last replaced this file and when. Distinct
        from `uploadedBy`/`uploadedAt`, which stay as the original record. */
    lastModifiedBy: text("last_modified_by").references(() => user.id),
    lastModifiedAt: timestamp("last_modified_at"),

    /** A soft delete: the row and its audit trail stay, so "who deleted the
        electricity bill and when" is still answerable after it's gone. Every
        query that lists or gates on documents filters `deletedAt IS NULL`. */
    deletedBy: text("deleted_by").references(() => user.id),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("documents_project_idx").on(t.projectId),
    index("documents_type_idx").on(t.projectId, t.docType),
  ],
);

/**
 * Field evidence.
 *
 * Coordinates come from navigator.geolocation at shutter time and are stored
 * here — never read back from EXIF, because iOS Safari strips EXIF GPS on web
 * uploads and the photo would silently lose its location.
 */
export const photos = pgTable(
  "photos",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    photoType: photoTypeEnum("photo_type").notNull(),

    s3KeyOriginal: text("s3_key_original"),
    s3KeyPortal: text("s3_key_portal"),
    s3KeyThumb: text("s3_key_thumb"),

    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    accuracyM: numeric("accuracy_m", { precision: 8, scale: 2 }),
    capturedAt: timestamp("captured_at"),

    uploadedBy: text("uploaded_by").references(() => user.id),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    deviceInfo: text("device_info"),
  },
  (t) => [index("photos_project_idx").on(t.projectId, t.photoType)],
);

/** Reference numbers that live on someone else's portal. */
export const externalRefs = pgTable("external_refs", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  dcrNumber: text("dcr_number"),
  dcrIssuedOn: timestamp("dcr_issued_on"),
  meterPaymentRef: text("meter_payment_ref"),
  meterPaidOn: timestamp("meter_paid_on"),
  meterAmount: numeric("meter_amount", { precision: 12, scale: 2 }),
  /** Jan Samarth — the loan is applied for there, not in this app. */
  janSamarthApplicationId: text("jan_samarth_application_id"),
  sanctionNumber: text("sanction_number"),
  commissioningCertNo: text("commissioning_cert_no"),
  netMeterSerial: text("net_meter_serial"),
  /** Asked for when the commissioning certificate is generated. */
  performanceCheckDate: timestamp("performance_check_date"),
  commissioningDate: timestamp("commissioning_date"),
  jointInspectionDate: timestamp("joint_inspection_date"),
});
