import { index, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { projects } from "./core";
import { systemTypeEnum } from "./enums";

/**
 * Pre-installation cost estimates.
 *
 * A planning tool, not a ledger: an estimate never becomes an expense, a
 * cost sheet or a margin. It is how the office arrives at a price to quote —
 * on-grid, hybrid or off-grid, with batteries sized and cable assumed — and
 * it can be attached to a project the way a quotation is, or stand alone for
 * a walk-in.
 *
 * The inputs are kept whole as JSON so the calculation can be re-run exactly
 * as it was, and the headline figures are copied into columns so the list
 * can sort and search without re-running anything.
 */
export const estimates = pgTable(
  "estimates",
  {
    id: text("id").primaryKey(),
    /** EST-0001 upward. Shown on the list and the page heading. */
    number: text("number").notNull().unique(),
    /** Who it is for: the customer's name, or a label like "Sharma, 2nd floor". */
    name: text("name").notNull(),
    phone: text("phone"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    systemType: systemTypeEnum("system_type").notNull().default("ON_GRID"),
    capacityKw: numeric("capacity_kw", { precision: 8, scale: 2 }).notNull(),
    /** Everything the calculator was given, overrides included. */
    inputs: jsonb("inputs").notNull(),
    /**
     * The rate card as it stood when the estimate was priced. An old estimate
     * keeps its prices until someone chooses to re-price it.
     */
    rates: jsonb("rates"),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull().default("0"),
    quoteWithGst: numeric("quote_with_gst", { precision: 14, scale: 2 }).notNull().default("0"),
    customerPays: numeric("customer_pays", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("estimates_project_idx").on(t.projectId), index("estimates_created_idx").on(t.createdAt)],
);
