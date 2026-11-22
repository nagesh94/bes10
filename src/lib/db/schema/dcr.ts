import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Who sold us the modules — a reseller or distributor, not the factory.
 *
 * Distinct from `panel_companies`, which are manufacturers (Premier, Waaree).
 * A DCR certificate names both: the manufacturer in its body and the supplier
 * as the party certifying the sale to us. GSTIN is how an uploaded
 * certificate finds its supplier, so it is unique when present.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    gstin: text("gstin"),
    pan: text("pan"),
    address: text("address"),
    state: text("state"),
    pincode: text("pincode"),
    phone: text("phone"),
    email: text("email"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suppliers_gstin_idx").on(t.gstin)],
);

/** One step of the NISE chain of custody, e.g. "DCR Claimed - Smart Solar Energies". */
export interface DcrChainStep {
  date: string | null;
  event: string;
  party: string | null;
}

/**
 * A DCR certificate as issued on the NISE portal (solardcrportal.nise.res.in).
 *
 * Stored field by field because the installation side reads them back: the
 * PO, the invoice and the cell manufacturer go straight into the DCR
 * undertaking once a project's panel serials match this certificate.
 */
export const dcrCertificates = pgTable(
  "dcr_certificates",
  {
    id: serial("id").primaryKey(),
    certificateNo: text("certificate_no").notNull(),
    revision: text("revision").notNull().default("00"),
    /** B2B for a sale to a dealer; the portal prints it beside the number. */
    certType: text("cert_type"),
    certDate: date("cert_date"),

    supplierId: integer("supplier_id").references(() => suppliers.id),
    issuedToName: text("issued_to_name"),
    issuedToGstin: text("issued_to_gstin"),

    purchaseOrderNo: text("purchase_order_no"),
    /** Not printed on the certificate — typed at review, defaulting to the invoice date. */
    purchaseOrderDate: date("purchase_order_date"),
    invoiceRef: text("invoice_ref"),
    invoiceDate: date("invoice_date"),

    cellManufacturer: text("cell_manufacturer"),
    cellManufacturerAddress: text("cell_manufacturer_address"),
    moduleManufacturer: text("module_manufacturer"),
    moduleManufacturerAddress: text("module_manufacturer_address"),

    modelNo: text("model_no"),
    moduleDescription: text("module_description"),
    wattPeak: integer("watt_peak"),
    efficiency: numeric("efficiency", { precision: 5, scale: 2 }),
    technology: text("technology"),
    cellModel: text("cell_model"),
    quantity: integer("quantity"),
    totalKw: numeric("total_kw", { precision: 10, scale: 2 }),

    chain: jsonb("chain").$type<DcrChainStep[]>(),

    fileName: text("file_name"),
    s3Key: text("s3_key"),
    sizeBytes: integer("size_bytes"),
    /** What the parser and the model each returned, kept for when a value is disputed. */
    extracted: jsonb("extracted"),
    extractionMethod: text("extraction_method"),

    notes: text("notes"),
    uploadedBy: text("uploaded_by").references(() => user.id),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dcr_certificates_no_idx").on(t.certificateNo),
    index("dcr_certificates_supplier_idx").on(t.supplierId),
  ],
);

/**
 * One row per module on a certificate.
 *
 * Unique across every certificate: a module can only have been certified
 * once. Which project it went on is not stored here — it is read from
 * `panel_serials`, so there is no second copy to drift out of step.
 * Stored upper-cased with spaces removed; see `normaliseSerial`.
 */
export const dcrSerials = pgTable(
  "dcr_serials",
  {
    id: serial("id").primaryKey(),
    certificateId: integer("certificate_id")
      .notNull()
      .references(() => dcrCertificates.id, { onDelete: "cascade" }),
    serialNo: text("serial_no").notNull(),
    wattPeak: integer("watt_peak"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("dcr_serials_serial_idx").on(t.serialNo),
    index("dcr_serials_certificate_idx").on(t.certificateId),
  ],
);
