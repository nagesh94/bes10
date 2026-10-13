import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import {
  leadStatusEnum,
  lifecycleEnum,
  segmentEnum,
  stageStatusEnum,
} from "./enums";

/**
 * One row from first phone call to closed project.
 *
 * Lead / Prospect / Customer is a STATUS, not three tables. Separate tables
 * would mean copying data on every transition and losing the history; here
 * nothing moves and `stage_history` keeps the trail.
 */

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  gender: text("gender"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  pinCode: text("pin_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    /** Human-facing, e.g. BHIM-2026-0007. Read aloud, so it is monospace in the UI. */
    code: text("code").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),

    lifecycleStage: lifecycleEnum("lifecycle_stage").notNull().default("LEAD"),
    /** 1..9 — see lib/workflow/stages.ts */
    pipelineStage: integer("pipeline_stage").notNull().default(1),
    stageEnteredAt: timestamp("stage_entered_at").notNull().defaultNow(),

    segment: segmentEnum("segment").notNull().default("RESIDENTIAL"),

    // Lead-only fields, kept on the same row after conversion
    leadStatus: leadStatusEnum("lead_status").notNull().default("NEW"),
    leadSource: text("lead_source"),
    interestedPlantKw: text("interested_plant_kw"),

    assignedEmployeeId: text("assigned_employee_id").references(() => user.id),
    /**
     * The channel partner who sent this in, if any.
     *
     * Not a foreign key to channel_partners: that table imports this one for
     * its own commission rows, and Drizzle cannot resolve the cycle. The id
     * is written only by an action that has just read the partner.
     */
    referredByPartnerId: text("referred_by_partner_id"),

    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    uniqueIndex("projects_code_idx").on(t.code),
    index("projects_lifecycle_idx").on(t.lifecycleStage),
    index("projects_stage_idx").on(t.pipelineStage),
  ],
);

/**
 * The crew on a job. A project can have several installers and an installer
 * several jobs, so this is a join table rather than a column on `projects` —
 * a single `assigned_installer_id` could only ever hold one of them.
 *
 * This is the only thing that grants an installer access to a project, so a
 * row removed here takes the job off their list immediately.
 */
export const projectInstallers = pgTable(
  "project_installers",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    installerId: text("installer_id")
      .notNull()
      .references(() => user.id),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
    assignedBy: text("assigned_by").references(() => user.id),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.installerId] }),
    index("project_installers_installer_idx").on(t.installerId),
  ],
);

export const projectStageProgress = pgTable(
  "project_stage_progress",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stageNo: integer("stage_no").notNull(),
    status: stageStatusEnum("status").notNull().default("not_started"),
    completedBy: text("completed_by").references(() => user.id),
    completedAt: timestamp("completed_at"),
    blockedReason: text("blocked_reason"),
  },
  (t) => [uniqueIndex("stage_progress_unique").on(t.projectId, t.stageNo)],
);

export const stageHistory = pgTable(
  "stage_history",
  {
    id: serial("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromStage: integer("from_stage"),
    toStage: integer("to_stage").notNull(),
    actorId: text("actor_id").references(() => user.id),
    at: timestamp("at").notNull().defaultNow(),
    note: text("note"),
    /** Required when an admin pushes past an unmet gate. */
    overrideReason: text("override_reason"),
  },
  (t) => [index("stage_history_project_idx").on(t.projectId)],
);

/**
 * Every mutation. Reads of an Aadhaar document are logged here too, which is
 * why the table carries an action rather than just before/after.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    projectId: text("project_id").references(() => projects.id),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    ip: text("ip"),
    at: timestamp("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_at_idx").on(t.at),
    index("audit_actor_idx").on(t.actorId),
    index("audit_project_idx").on(t.projectId),
  ],
);

/**
 * Company settings — the letterhead, the vendor details, the signatory.
 * One row per branch, because a Bhopal branch prints a different footer
 * address from Betul.
 */
export const companyBranches = pgTable("company_branches", {
  id: text("id").primaryKey(),
  /** The branch label — "Betul". Never printed on a document. */
  name: text("name").notNull(),
  /**
   * The trading name, as it appears on a letterhead.
   *
   * Separate from `name` because a branch is called Betul and the company is
   * called BHIM ENERGY SOLUTIONS, and the two were conflated for long enough
   * that two call sites carried a `name === "Betul"` workaround with
   * different capitalisation.
   */
  companyName: text("company_name").notNull().default("BHIM ENERGY SOLUTIONS"),
  isDefault: boolean("is_default").notNull().default(false),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  pinCode: text("pin_code").notNull(),
  phones: text("phones").notNull(),
  email: text("email").notNull(),
  gstin: text("gstin"),
  signatoryName: text("signatory_name").notNull(),
  signatoryDesignation: text("signatory_designation").notNull(),
  signatoryPhone: text("signatory_phone"),

  /**
   * Where the customer pays. Printed as the Bank Details block on every
   * quotation, which is the only document that states them — so they live
   * on the branch rather than in code, and a change of bank is an admin
   * edit rather than a deploy.
   */
  bankName: text("bank_name"),
  bankAccountNo: text("bank_account_no"),
  bankIfsc: text("bank_ifsc"),
  bankAccountType: text("bank_account_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
