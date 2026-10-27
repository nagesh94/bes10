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
import { agreementStatusEnum } from "./enums";

/**
 * Vendor agreements.
 *
 * Built as the quotation is built, and for the same reason: the agreement
 * is a legal document that has to be reproducible exactly as it was handed
 * over, so everything that prints is copied onto the row at save time — the
 * consumer's name and address, the vendor's registered office, the cost and
 * the instalments. A project that later changes its address does not
 * rewrite an agreement already with the notary.
 *
 * Two things differ from `quotations`, both deliberate:
 *
 * There is **no number series**. The model agreement (Annexure 2) carries
 * no number on the paper, so inventing one would print something the office
 * has never sent. The list is read by consumer and execution date.
 *
 * The **cost is typed here**, not read from the payment plan. The agreement
 * used to refuse to generate until the plan was locked, which left the
 * office unable to produce a draft for a customer sitting in front of them.
 * Clause 19.1 states a figure that is agreed in conversation, often before
 * anyone opens the plan — so the figure belongs on the agreement, prefilled
 * from the saved plan or the chosen quotation when either exists.
 *
 * `project_id` is nullable for the same reason it is on a quotation: a
 * walk-in may be given a draft before there is a project to hang it on.
 */
export const agreements = pgTable(
  "agreements",
  {
    id: text("id").primaryKey(),

    /** Null for an agreement drafted before there is a project. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    status: agreementStatusEnum("status").notNull().default("DRAFT"),

    /**
     * The one agreement of a project's several that is the real one.
     *
     * Same shape as `quotations.is_chosen` and for the same reason: a
     * project may carry two drafts while a price is being argued, but only
     * one is filed as the project's `AGREEMENT` document, which is what the
     * bank loan pack prints and what the stage 2 gate counts. Enforced by a
     * partial unique index rather than application code.
     */
    isPrimary: boolean("is_primary").notNull().default(false),

    /** Printed in the opening line: "executed on 13/10/2026". */
    executionDate: date("execution_date").notNull(),

    // ── First party, as printed ──
    /** "Mr." / "Mrs." — blank when unknown, never guessed on a legal document. */
    consumerTitle: text("consumer_title"),
    consumerName: text("consumer_name").notNull(),
    consumerAddress: text("consumer_address").notNull(),

    // ── Second party, snapshotted from the branch ──
    branchId: text("branch_id"),
    vendorName: text("vendor_name").notNull(),
    vendorAddress: text("vendor_address").notNull(),

    /** Clause 19.1 — the agreed cost of the RTS system. */
    totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull(),

    /** Where 19.1's figure was taken from, for the audit trail. */
    valueSource: text("value_source"),

    // ── The rendered file ──
    s3Key: text("s3_key"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    docxGeneratedAt: timestamp("docx_generated_at"),
    /** The `documents` row filed against the project, when there is one. */
    documentId: text("document_id"),

    /**
     * As on `quotations`: the row survives the delete so who signed what,
     * and who removed it, stays answerable. The file, the filed document
     * and the link to the project do not. See `deleteAgreement`.
     */
    deletedBy: text("deleted_by").references(() => user.id),
    deletedAt: timestamp("deleted_at"),

    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("agreements_project_idx").on(t.projectId),
    // One filed agreement per project. Partial, so the drafts alongside it
    // are not constrained against each other.
    uniqueIndex("agreements_primary_idx")
      .on(t.projectId)
      .where(sql`${t.isPrimary} and ${t.projectId} is not null`),
    index("agreements_created_idx").on(t.createdAt),
  ],
);

/**
 * Clause 19.1 (i)(ii)(iii) — the instalments.
 *
 * The amount is a number here, unlike `quotation_milestones.schedule` which
 * is free text: the quotation prints "10%" verbatim in a table, while the
 * agreement prints a rupee figure inside a sentence and the percentage is
 * worked out from the total at render time. A schedule that does not add up
 * to the total is the office's business, not the app's, so it is not
 * enforced — but the form shows the running difference.
 */
export const agreementMilestones = pgTable(
  "agreement_milestones",
  {
    id: serial("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index("agreement_milestones_agreement_idx").on(t.agreementId)],
);
