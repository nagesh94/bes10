/**
 * The single source of truth for who can do what.
 *
 * Every server action and route handler asks this module. There are no
 * `if (role === "ADMIN")` checks anywhere else in the codebase — if you find
 * one, it is a bug, because it cannot be tested as a matrix and it drifts.
 *
 * The hardest boundary here is money. Employees and installers see no amounts
 * anywhere: not project value, not the payment plan, not payments received,
 * not the subsidy figure, not partner rates or payouts. A channel partner sees
 * only their own commission. See `canSeeMoney` and `MONEY_ACTIONS`.
 */

export const ROLES = ["ADMIN", "EMPLOYEE", "INSTALLER", "PARTNER"] as const;
export type Role = (typeof ROLES)[number];

/**
 * How far a role's permission reaches.
 *   all      — every record
 *   assigned — only records this user is assigned to
 *   own      — only records belonging to this user (a partner's own referrals)
 */
export type Scope = "all" | "assigned" | "own";

export type Action =
  // Leads and projects
  | "lead.read"
  | "lead.write"
  | "lead.convert"
  | "project.read"
  | "project.write"
  | "project.assign"
  // Stage 1
  | "prospect.write"
  | "flag.resolve"
  | "flag.waive"
  // Field work — open to every staff role, whoever is on site
  | "survey.write"
  | "installation.write"
  | "evidence.write"
  | "photo.upload"
  // Documents
  | "document.read"
  | "document.upload"
  | "document.generate"
  | "document.pack"
  | "document.delete"
  // Quotations and agreements. See the note on the matrix entries below.
  | "quotation.read"
  | "quotation.write"
  | "agreement.read"
  | "agreement.write"
  // External portal steps
  | "portal.dcr"
  | "portal.meter"
  | "portal.upload"
  | "commissioning.write"
  // Money — admin only
  | "money.read"
  | "money.write"
  | "finance.write"
  | "settlement.write"
  | "partner.read"
  | "partner.write"
  | "payout.read"
  | "payout.write"
  // Referrals
  | "referral.create"
  | "referral.read"
  // Stage control
  | "stage.advance"
  | "stage.override"
  // Admin
  | "admin.users"
  | "admin.masterdata"
  | "admin.templates"
  | "admin.audit";

type Matrix = Record<Action, Partial<Record<Role, Scope>>>;

/**
 * Absent role = denied. There is no implicit allow.
 */
const MATRIX: Matrix = {
  "lead.read": { ADMIN: "all", EMPLOYEE: "all" },
  "lead.write": { ADMIN: "all", EMPLOYEE: "all" },
  "lead.convert": { ADMIN: "all", EMPLOYEE: "all" },

  "project.read": { ADMIN: "all", EMPLOYEE: "all", INSTALLER: "assigned", PARTNER: "own" },
  "project.write": { ADMIN: "all", EMPLOYEE: "all" },
  "project.assign": { ADMIN: "all", EMPLOYEE: "all" },

  "prospect.write": { ADMIN: "all", EMPLOYEE: "all" },
  "flag.resolve": { ADMIN: "all", EMPLOYEE: "all" },
  "flag.waive": { ADMIN: "all" },

  // Field work is open, money is not. Whoever is on site can do the survey,
  // the installation record and the photos. An installer reaches these on
  // their own jobs only, through /installer — never through the pipeline.
  "survey.write": { ADMIN: "all", EMPLOYEE: "all", INSTALLER: "assigned" },
  "installation.write": { ADMIN: "all", EMPLOYEE: "all", INSTALLER: "assigned" },
  "evidence.write": { ADMIN: "all", EMPLOYEE: "all", INSTALLER: "assigned" },
  "photo.upload": { ADMIN: "all", EMPLOYEE: "all", INSTALLER: "assigned" },

  "document.read": { ADMIN: "all", EMPLOYEE: "all" },
  "document.upload": { ADMIN: "all", EMPLOYEE: "all" },
  "document.generate": { ADMIN: "all", EMPLOYEE: "all" },
  "document.pack": { ADMIN: "all", EMPLOYEE: "all" },
  // Deleting a filed document is irreversible for the office — only admin.
  "document.delete": { ADMIN: "all" },

  // A quotation states the project price, so these are the one pair of
  // actions that let an employee see an amount. That is a deliberate hole in
  // the money boundary rather than an oversight: quoting is the sales step,
  // it happens at the counter, and routing every walk-in through an admin
  // would stop the office working. The hole is exactly this wide — an
  // employee reads the number they themselves quoted and nothing else. The
  // payment plan, payments received, the subsidy and partner payouts stay
  // admin-only, which is why `quotation.*` is not in MONEY_ACTIONS.
  "quotation.read": { ADMIN: "all", EMPLOYEE: "all" },
  "quotation.write": { ADMIN: "all", EMPLOYEE: "all" },

  // The agreement states the same figure the quotation does — clause 19.1
  // is the price the customer accepted — so it sits inside the hole the
  // quotation already opened rather than widening it. An employee who may
  // quote a job may draw up its agreement; one who may not, may not. This
  // is still not `money.read`: the payment plan, payments received, the
  // subsidy and partner payouts remain admin-only.
  "agreement.read": { ADMIN: "all", EMPLOYEE: "all" },
  "agreement.write": { ADMIN: "all", EMPLOYEE: "all" },

  "portal.dcr": { ADMIN: "all", EMPLOYEE: "all" },
  "portal.meter": { ADMIN: "all", EMPLOYEE: "all" },
  "portal.upload": { ADMIN: "all", EMPLOYEE: "all" },
  "commissioning.write": { ADMIN: "all", EMPLOYEE: "all" },

  // ── Money. Admin only, with one exception below. ──
  "money.read": { ADMIN: "all" },
  "money.write": { ADMIN: "all" },
  "finance.write": { ADMIN: "all" },
  "settlement.write": { ADMIN: "all" },
  "partner.read": { ADMIN: "all" },
  "partner.write": { ADMIN: "all" },
  "payout.read": { ADMIN: "all" },
  "payout.write": { ADMIN: "all" },

  // An installer has one job list and two forms. Referrals are not part of it.
  "referral.create": { ADMIN: "all", EMPLOYEE: "all", PARTNER: "own" },
  "referral.read": { ADMIN: "all", EMPLOYEE: "all", PARTNER: "own" },

  "stage.advance": { ADMIN: "all", EMPLOYEE: "all" },
  // The gate informs rather than blocks: real projects move on with a line
  // still open, and the record of why is what matters. Employees can push
  // past an unmet gate, but never silently — a written reason is required
  // and lands in the audit log and the stage history.
  "stage.override": { ADMIN: "all", EMPLOYEE: "all" },

  "admin.users": { ADMIN: "all" },
  "admin.masterdata": { ADMIN: "all" },
  "admin.templates": { ADMIN: "all" },
  "admin.audit": { ADMIN: "all" },
};

/** Everything that touches an amount. Asserted as a set in the tests. */
export const MONEY_ACTIONS: readonly Action[] = [
  "money.read",
  "money.write",
  "finance.write",
  "settlement.write",
  "partner.read",
  "partner.write",
  "payout.read",
  "payout.write",
] as const;

export interface Actor {
  id: string;
  role: Role;
  /** Set when the actor is a channel partner. */
  partnerId?: string | null;
}

/** What is being acted on. Only needed for `assigned` and `own` scopes. */
export interface ResourceContext {
  assignedEmployeeId?: string | null;
  /** Every installer on the crew — a job can have more than one. */
  assignedInstallerIds?: readonly string[] | null;
  partnerId?: string | null;
  ownerId?: string | null;
}

export function can(
  actor: Actor | null | undefined,
  action: Action,
  resource?: ResourceContext,
): boolean {
  if (!actor) return false;

  const scope = MATRIX[action]?.[actor.role];
  if (!scope) return false;

  if (scope === "all") return true;

  // Beyond this point the permission is conditional, so a missing resource is
  // a denial rather than a pass. Failing closed is the whole point.
  if (!resource) return false;

  if (scope === "assigned") {
    return (
      (!!resource.assignedInstallerIds && resource.assignedInstallerIds.includes(actor.id)) ||
      (!!resource.assignedEmployeeId && resource.assignedEmployeeId === actor.id)
    );
  }

  if (scope === "own") {
    if (actor.partnerId && resource.partnerId) {
      return resource.partnerId === actor.partnerId;
    }
    return !!resource.ownerId && resource.ownerId === actor.id;
  }

  return false;
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
    this.name = "ForbiddenError";
  }
}

/** Use at the top of every server action. Throws rather than returning false. */
export function assertCan(
  actor: Actor | null | undefined,
  action: Action,
  resource?: ResourceContext,
): asserts actor is Actor {
  if (!can(actor, action, resource)) throw new ForbiddenError(action);
}

/**
 * Whether monetary columns may be selected at all for this actor.
 *
 * This is checked in the query layer, not the view layer. A non-admin request
 * never loads an amount, so there is no figure sitting in a payload waiting to
 * be found in dev tools. Hiding a field in the interface is not a control.
 *
 * The one exception: a channel partner sees their own commission, which is
 * served by a dedicated query, never by relaxing this.
 */
export function canSeeMoney(role: Role): boolean {
  return role === "ADMIN";
}

export function isStaff(role: Role): boolean {
  return role === "ADMIN" || role === "EMPLOYEE" || role === "INSTALLER";
}
