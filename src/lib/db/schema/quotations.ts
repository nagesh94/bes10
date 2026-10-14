import { sql } from "drizzle-orm";
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
import { user } from "./auth";
import { projects } from "./core";
import { quotationStatusEnum, systemTypeEnum } from "./enums";

/**
 * Quotations.
 *
 * A quotation is the first piece of paper a customer is given, and it is a
 * commercial offer: once it leaves the office it has to be reproducible
 * exactly as it was sent, even a year later. So every field that prints is
 * copied onto the row rather than read back through the project — the
 * consumer's name, the letterhead, the bank details, the signatory. A
 * project that later changes its address does not rewrite a quotation
 * already in the customer's hands.
 *
 * `project_id` is nullable on purpose. Half of these are raised at the
 * counter for a walk-in who is not yet a lead; the other half are raised
 * from inside a project, which only means the form arrives pre-filled.
 */

export const quotations = pgTable(
  "quotations",
  {
    id: text("id").primaryKey(),
    /** BHIM100000 upward. Allocated once, never reused — see lib/quotations/number.ts. */
    number: text("number").notNull(),

    /** Null for a standalone quotation raised before there is a project. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    status: quotationStatusEnum("status").notNull().default("DRAFT"),
    /**
     * The one quotation of a project's several that is the live offer.
     *
     * A customer is routinely shown two or three — 3 kW against 5 kW, with
     * and without a battery — and exactly one of them is the deal. Only the
     * chosen one is filed as the project's `QUOTATION` document, which is
     * what the bank loan pack prints and what the stage gate counts; the
     * rest stay on the project as the alternatives they are.
     *
     * At most one per project is enforced by a partial unique index below,
     * not by application code, because two chosen quotations would put two
     * different prices into the same bank file.
     */
    isChosen: boolean("is_chosen").notNull().default(false),
    quotationDate: date("quotation_date").notNull(),

    // ── Consumer, as printed ──
    /** "Mr." / "Mrs." — blank when unknown, never guessed. */
    consumerTitle: text("consumer_title"),
    consumerName: text("consumer_name").notNull(),
    consumerAddress: text("consumer_address"),
    consumerPhone: text("consumer_phone"),

    // ── The offer ──
    capacityKwp: numeric("capacity_kwp", { precision: 6, scale: 2 }).notNull(),
    systemType: systemTypeEnum("system_type").notNull().default("ON_GRID"),
    /** "M.P. Net / Smart Metering Policy" — the line in the subject. */
    meteringPolicy: text("metering_policy").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),

    /**
     * What was picked from the master-data dropdowns.
     *
     * These also appear inside `quotation_items`, which is what actually
     * prints. The duplication is deliberate: the item rows are free text by
     * the time a quotation is saved — staff reword the remarks — so they
     * cannot be parsed back into a dropdown when the form is reopened.
     * Keeping the selection lets an edit start where it left off.
     */
    structureMake: text("structure_make"),
    panelCompany: text("panel_company"),
    panelModel: text("panel_model"),
    panelWattPeak: integer("panel_watt_peak"),
    /** Why the panel row can read "3.24 kw" under a "3KWP" heading. */
    panelCount: integer("panel_count"),
    inverterMake: text("inverter_make"),
    inverterModel: text("inverter_model"),

    // ── Letterhead, snapshotted from the branch ──
    branchId: text("branch_id"),
    vendorName: text("vendor_name").notNull(),
    vendorAddress: text("vendor_address").notNull(),
    vendorPhones: text("vendor_phones").notNull(),
    vendorEmail: text("vendor_email").notNull(),
    vendorGstin: text("vendor_gstin"),
    signatoryName: text("signatory_name").notNull(),

    // ── Bank block, snapshotted too: the company may change banks ──
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankIfsc: text("bank_ifsc"),
    bankAccountType: text("bank_account_type"),

    /** Free text printed under the project summary. Usually empty. */
    notes: text("notes"),

    // ── The rendered file ──
    s3Key: text("s3_key"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    pdfGeneratedAt: timestamp("pdf_generated_at"),
    /** The `documents` row filed against the project, when there is one. */
    documentId: text("document_id"),

    /**
     * Deleting a quotation keeps the row and drops everything around it —
     * the stored PDF, the filed document and the link to the project. The
     * number is what survives: it was handed to a customer and may be read
     * back over the phone a year later, so "BHIM100003 was deleted on the
     * 4th by Priya, it was Shashikala's 3 kW offer" has to stay answerable.
     * Every listing filters `deleted_at is null`; see `deleteQuotation`.
     */
    deletedBy: text("deleted_by").references(() => user.id),
    deletedAt: timestamp("deleted_at"),

    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quotations_number_idx").on(t.number),
    index("quotations_project_idx").on(t.projectId),
    // One chosen quotation per project. Partial, so the unchosen ones are
    // not constrained against each other.
    uniqueIndex("quotations_chosen_idx")
      .on(t.projectId)
      .where(sql`${t.isChosen} and ${t.projectId} is not null`),
    index("quotations_created_idx").on(t.createdAt),
  ],
);

/**
 * The Material Description table, one row per line.
 *
 * Quantity is text rather than a number because the original mixes units in
 * the same column — "1 Set", "3.24 kw", "In Meter", "1 No." — and squeezing
 * that into a number plus a unit would misprint half of them.
 */
export const quotationItems = pgTable(
  "quotation_items",
  {
    id: serial("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull(),
    qty: text("qty"),
    make: text("make"),
    remark: text("remark"),
  },
  (t) => [index("quotation_items_quotation_idx").on(t.quotationId)],
);

/** The Payment Schedule table. `schedule` prints verbatim: "10%", "On order". */
export const quotationMilestones = pgTable(
  "quotation_milestones",
  {
    id: serial("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label").notNull(),
    schedule: text("schedule").notNull(),
  },
  (t) => [index("quotation_milestones_quotation_idx").on(t.quotationId)],
);

/**
 * The quotation number series.
 *
 * One row, incremented with a single `INSERT … ON CONFLICT DO UPDATE …
 * RETURNING`, which takes a row lock for the duration of the statement. A
 * `max(number) + 1` would hand the same number to two people who click
 * Save at once, and two customers holding different papers numbered
 * BHIM100042 is exactly the failure this table exists to prevent.
 *
 * Deliberately not a Postgres sequence: a sequence cannot be read, reset or
 * explained to the office without a superuser, and this number is quoted
 * over the phone.
 */
export const quotationCounters = pgTable("quotation_counters", {
  id: text("id").primaryKey(),
  /** The number most recently handed out. Starts the series at 100000. */
  lastNumber: integer("last_number").notNull(),
});

/**
 * Whether the scope table's two tick columns were overridden.
 *
 * The Project Scope table is boilerplate on every quotation BHIM has ever
 * sent, so its rows live in code (lib/quotations/content.ts) rather than
 * here. This table only records a deviation, which keeps the common case
 * free of eight junk rows per quotation.
 */
export const quotationScopeOverrides = pgTable(
  "quotation_scope_overrides",
  {
    id: serial("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    /** Matches a key in SCOPE_ROWS. */
    rowKey: text("row_key").notNull(),
    byBhim: boolean("by_bhim").notNull(),
    byCustomer: boolean("by_customer").notNull(),
  },
  (t) => [uniqueIndex("quotation_scope_unique").on(t.quotationId, t.rowKey)],
);
