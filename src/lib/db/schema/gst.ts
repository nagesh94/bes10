import { sql } from "drizzle-orm";
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
import { projects } from "./core";
import { suppliers } from "./dcr";

/**
 * GST bills: tax invoices, bills of supply and credit/debit notes.
 *
 * Built to hold any GST document, not one supplier's layout. The tax heads
 * are fixed by law (CGST, SGST/UTGST, IGST, cess), so they are columns and
 * every report is a plain sum. Everything that varies between bills —
 * freight, packing, discounts, services with no quantity, mixed rates — is
 * a line in `gst_bill_items`, distinguished by `kind`.
 *
 * `direction` is "purchase" (a supplier billed us; its GST is input tax we
 * can claim) or "sales" (we billed someone; output tax we owe). The other
 * party is always kept as printed (`party_*`), and a purchase is also linked
 * to `suppliers` — the same list DCR certificates use, matched by GSTIN.
 */
export const gstBills = pgTable(
  "gst_bills",
  {
    id: serial("id").primaryKey(),
    /** "purchase" | "sales". */
    direction: text("direction").notNull().default("purchase"),
    /** "tax_invoice" | "bill_of_supply" | "credit_note" | "debit_note" | "other". */
    docType: text("doc_type").notNull().default("tax_invoice"),

    invoiceNo: text("invoice_no").notNull(),
    invoiceDate: date("invoice_date").notNull(),

    /** The seller on a purchase. Null for sales, or a supplier not yet in the list. */
    supplierId: integer("supplier_id").references(() => suppliers.id),
    /** The other party as printed: the seller on a purchase, the buyer on a sale. */
    partyName: text("party_name").notNull(),
    /** Null for an unregistered party. */
    partyGstin: text("party_gstin"),
    /** Which of our GSTINs the bill names. */
    ourGstin: text("our_gstin"),
    /** Two-digit state code of the place of supply; decides CGST+SGST vs IGST. */
    placeOfSupply: text("place_of_supply"),
    /** Reverse charge: the buyer pays the GST to the government, not the seller. */
    reverseCharge: boolean("reverse_charge").notNull().default(false),

    /** e-Invoice reference — unique per invoice nationwide, the best duplicate check. */
    irn: text("irn"),
    ackNo: text("ack_no"),
    ackDate: date("ack_date"),
    ewayBillNo: text("eway_bill_no"),
    buyerOrderNo: text("buyer_order_no"),

    /** A credit or debit note names the invoice it corrects. */
    refInvoiceNo: text("ref_invoice_no"),
    refInvoiceDate: date("ref_invoice_date"),

    /** The site the purchase was for. Null is stock or overhead. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    /** Sum of every line's taxable value: goods, services and charges, less discounts. */
    taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
    cgst: numeric("cgst", { precision: 14, scale: 2 }).notNull().default("0"),
    /** SGST, or UTGST for a Union Territory — the same slot on GSTR returns. */
    sgst: numeric("sgst", { precision: 14, scale: 2 }).notNull().default("0"),
    igst: numeric("igst", { precision: 14, scale: 2 }).notNull().default("0"),
    cess: numeric("cess", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Income-tax TCS collected on the bill. Not GST, but part of what is paid. */
    tcs: numeric("tcs", { precision: 14, scale: 2 }).notNull().default("0"),
    roundOff: numeric("round_off", { precision: 14, scale: 2 }).notNull().default("0"),
    /** The bill's grand total, as printed. */
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),

    /** False where GST is blocked from credit (food, personal use) or for a bill of supply. */
    itcEligible: boolean("itc_eligible").notNull().default(true),

    notes: text("notes"),

    fileName: text("file_name"),
    s3Key: text("s3_key"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    /** What the parser and the model each returned, kept for when a value is disputed. */
    extracted: jsonb("extracted"),
    extractionMethod: text("extraction_method"),

    uploadedBy: text("uploaded_by").references(() => user.id),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    /** Removed bills are kept for the audit trail, never counted. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    // A removed bill must not block uploading the same invoice again.
    uniqueIndex("gst_bills_irn_idx").on(t.irn).where(sql`${t.deletedAt} is null`),
    index("gst_bills_date_idx").on(t.invoiceDate),
    index("gst_bills_supplier_idx").on(t.supplierId),
    index("gst_bills_party_gstin_idx").on(t.partyGstin),
    index("gst_bills_project_idx").on(t.projectId),
  ],
);

/**
 * One line of a bill.
 *
 * `kind` is what lets one table hold every layout: "goods" and "service" are
 * what was bought, "charge" is freight or packing added below them, and
 * "discount" is a reduction (stored with a negative taxable value). The
 * quantity, unit and rate are optional because a service or a charge has none.
 *
 * The lines' taxable values add up to the bill's; that is what extraction is
 * checked against.
 */
export const gstBillItems = pgTable(
  "gst_bill_items",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => gstBills.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** "goods" | "service" | "charge" | "discount". */
    kind: text("kind").notNull().default("goods"),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }),
    unit: text("unit"),
    rate: numeric("rate", { precision: 14, scale: 2 }),
    taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Total GST rate in percent: 18 for 9% CGST + 9% SGST, or 18% IGST. */
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }),
    cgst: numeric("cgst", { precision: 14, scale: 2 }).notNull().default("0"),
    sgst: numeric("sgst", { precision: 14, scale: 2 }).notNull().default("0"),
    igst: numeric("igst", { precision: 14, scale: 2 }).notNull().default("0"),
    cess: numeric("cess", { precision: 14, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("gst_bill_items_bill_idx").on(t.billId)],
);
