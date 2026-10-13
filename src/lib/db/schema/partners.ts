import {
  boolean,
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { projects } from "./core";
import { user } from "./auth";
import { commissionBasisEnum, commissionStatusEnum } from "./enums";

/**
 * Channel partners — the people who send referrals and are paid for them.
 *
 * A partner may or may not have a login. Most are an electrician or a shop
 * owner who phones a name in, and creating an account for them would be
 * friction for no gain; `userId` is set only for the ones who want to see
 * their own referrals in the app.
 *
 * Their rate lives here rather than on each commission so that changing it
 * affects future referrals only — a commission row keeps the rate it was
 * accrued at, which is what makes a historical payout reproducible.
 */
export const channelPartners = pgTable(
  "channel_partners",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    /** Where the money goes. Visible to admins only. */
    bankAccountNumber: text("bank_account_number"),
    ifscCode: text("ifsc_code"),
    upiId: text("upi_id"),
    panNumber: text("pan_number"),

    commissionBasis: commissionBasisEnum("commission_basis").notNull().default("PER_KW"),
    /** Rupees per kW, or a flat rupee amount per project. */
    commissionRate: numeric("commission_rate", { precision: 12, scale: 2 }),

    /** Set only when the partner has a login of their own. */
    userId: text("user_id").references(() => user.id),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("partners_active_idx").on(t.active)],
);

/**
 * What one referral earned.
 *
 * The rate and basis are copied onto the row at accrual, not read back from
 * the partner, so a later rate change cannot silently rewrite what somebody
 * was already owed.
 *
 * Accrual is at commissioning — the job is done and the subsidy is in motion
 * — which is when the company has actually earned the referral.
 */
export const commissions = pgTable(
  "commissions",
  {
    id: serial("id").primaryKey(),
    partnerId: text("partner_id")
      .notNull()
      .references(() => channelPartners.id, { onDelete: "restrict" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    status: commissionStatusEnum("status").notNull().default("ACCRUED"),
    /** The rate as it stood when this was accrued. */
    basis: commissionBasisEnum("basis").notNull(),
    rate: numeric("rate", { precision: 12, scale: 2 }).notNull(),
    /** Plant size the per-kW rate was applied to. Null for a flat fee. */
    plantKw: numeric("plant_kw", { precision: 6, scale: 2 }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

    accruedAt: timestamp("accrued_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
    paidReference: text("paid_reference"),
    cancelledReason: text("cancelled_reason"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("commissions_partner_idx").on(t.partnerId),
    index("commissions_project_idx").on(t.projectId),
    index("commissions_status_idx").on(t.status),
  ],
);
