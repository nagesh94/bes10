import {
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
import {
  financeStatusEnum,
  milestoneTriggerEnum,
  paymentModeEnum,
  paymentModeReceivedEnum,
  subsidyStatusEnum,
} from "./enums";

/**
 * Money.
 *
 * Everything in this file is admin-only. The split from `external_refs` is
 * deliberate: a Jan Samarth application ID and a sanction number are
 * reference numbers an employee needs in order to file documents, so they
 * live there. The loan *amount* is money, so it lives here, and a non-admin
 * query never selects from these tables at all.
 */

export const paymentPlans = pgTable("payment_plans", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  mode: paymentModeEnum("mode").notNull().default("CASH"),
  totalValue: numeric("total_value", { precision: 14, scale: 2 }),
  cashComponent: numeric("cash_component", { precision: 14, scale: 2 }),
  financeComponent: numeric("finance_component", { precision: 14, scale: 2 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Expected inflows. What actual payments are reconciled against.
 *
 * A line is a trigger and an amount — nothing else. There is no label: the
 * trigger already says what the money is for, and a free-text name on top of
 * it only ever disagreed with it. Lines are optional; a plan with none is a
 * total and a split, which is enough to quote and to sign against.
 */
export const paymentMilestones = pgTable(
  "payment_milestones",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    trigger: milestoneTriggerEnum("trigger").notNull(),
    dueDate: date("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

/** Actual inflows, each with proof. */
export const paymentsReceived = pgTable(
  "payments_received",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: integer("milestone_id").references(() => paymentMilestones.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    mode: paymentModeReceivedEnum("mode").notNull(),
    receivedOn: date("received_on").notNull(),
    referenceNo: text("reference_no"),
    proofDocumentId: text("proof_document_id"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => [index("payments_project_idx").on(t.projectId)],
);

/**
 * Money handed *to* the customer.
 *
 * It happens: the office pays a DISCOM fee on their behalf, or fronts them
 * cash against a subsidy that has not landed. It is not a discount and not an
 * expense — it is recoverable, so it is added to what the project owes and is
 * cleared by an ordinary payment received. The mode enum is shared with
 * inflows because these are the same instruments; a loan tranche is never one
 * of them.
 */
export const customerAdvances = pgTable(
  "customer_advances",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    mode: paymentModeReceivedEnum("mode").notNull(),
    paidOn: date("paid_on").notNull(),
    referenceNo: text("reference_no"),
    /** What it was for. The only way to explain the row a year later. */
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => [index("advances_project_idx").on(t.projectId)],
);

/**
 * The loan.
 *
 * Applied for on Jan Samarth, not here — this records the amount and where it
 * has got to. Only present when the payment mode involves finance; a cash
 * project never has a row.
 */
export const financeApplications = pgTable("finance_applications", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  bankName: text("bank_name"),
  loanAmount: numeric("loan_amount", { precision: 14, scale: 2 }),
  status: financeStatusEnum("status").notNull().default("NOT_APPLIED"),
  appliedOn: date("applied_on"),
  sanctionedOn: date("sanctioned_on"),
  disbursedOn: date("disbursed_on"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * The subsidy.
 *
 * Under PM Surya Ghar the CFA is credited to the customer's own account, not
 * to BHIM. That is exactly why `RECEIVED` is the event that triggers chasing
 * the balance: the customer now has the money.
 */
export const subsidies = pgTable("subsidies", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: subsidyStatusEnum("status").notNull().default("NOT_APPLIED"),
  expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }),
  receivedAmount: numeric("received_amount", { precision: 14, scale: 2 }),
  receivedOn: date("received_on"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
