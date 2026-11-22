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
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { projects } from "./core";
import { paymentModeReceivedEnum } from "./enums";

/**
 * Money going out of the business.
 *
 * Admin-only, like everything in money.ts. Every outflow is one row with a
 * category from master data, so "where does the money go" is a query rather
 * than a spreadsheet — and a row tied to a project is what turns a project's
 * value into a margin.
 */

/**
 * What the money was spent on. Master data, so a new kind of spend is an
 * admin's job rather than a deploy.
 *
 * The three flags make the expense form ask the right follow-up question:
 * who it was for, what exactly it was, and whether it belongs to a site.
 */
export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** A line of examples under the dropdown: "Panels, inverters, cable, BOS". */
  hint: text("hint"),
  /** Salary, personal use: the form asks whose. */
  needsPerson: boolean("needs_person").notNull().default(false),
  /** Other, personal use: the form insists on saying what it was for. */
  needsDetail: boolean("needs_detail").notNull().default(false),
  /** Material, transport, labour: usually spent on one site, so ask which. */
  perSite: boolean("per_site").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/**
 * The rate card: what a unit of each dealer-bought item costs.
 *
 * Master data, so a price change from the dealer is an admin edit. A
 * project's cost calculator starts from these and can override any of them;
 * the project keeps its own copy, so a new rate never rewrites an old job.
 */
export const costRates = pgTable("cost_rates", {
  id: serial("id").primaryKey(),
  /** Stable code the calculator looks rates up by: "PANEL", "WIRE_DC". */
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  /** What one unit is: "W", "kW", "m", "pipe", "piece", "pit". */
  unit: text("unit").notNull(),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * One project's cost sheet: the dealer-bought material that went on the
 * roof, each line a quantity times a rate.
 *
 * Separate from `expenses` on purpose. Panels, inverters and cable are
 * bought from dealers in bulk, not paid per site, so they count towards a
 * project's cost and margin without appearing as money paid out. The
 * per-site spend — agreement, cement, DISCOM fees, referral — stays in
 * `expenses` and is read alongside this.
 */
export const projectCostLines = pgTable(
  "project_cost_lines",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The rate-card code it started from, or "CUSTOM" for an added line. */
    code: text("code").notNull(),
    label: text("label").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
    unit: text("unit").notNull(),
    rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    /** How the dealer was paid: CASH, UPI, NET_BANKING or OTHER. Null until known. */
    paymentMode: text("payment_mode"),
    /** For OTHER: how, in words — "adjusted against dealer credit". */
    paymentNote: text("payment_note"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cost_lines_project_idx").on(t.projectId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    spentOn: date("spent_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    /** The site it was spent on. Null is overhead — rent, salary, tools. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Vendor, transporter, partner — whoever received the money. */
    paidTo: text("paid_to"),
    /** Same instruments as money handed to a customer; never a loan tranche. */
    mode: paymentModeReceivedEnum("mode").notNull(),
    referenceNo: text("reference_no"),
    /** A staff member, when the person is one — salary, personal use. */
    personUserId: text("person_user_id").references(() => user.id),
    /** The person's name as saved: a staff member's name, or typed. */
    personName: text("person_name"),
    /** What it was, and where the money was used. */
    details: text("details"),
    /** A bill, receipt or invoice for the spend — optional. */
    fileName: text("file_name"),
    s3Key: text("s3_key"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    /** Removed rows are kept for the audit trail, never counted. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("expenses_spent_on_idx").on(t.spentOn),
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_project_idx").on(t.projectId),
  ],
);
