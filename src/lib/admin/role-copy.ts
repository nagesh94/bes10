import type { Role } from "@/lib/rbac/permissions";

/**
 * The plain-language reading of the permission matrix, as the users board
 * shows it. The checks themselves live in `lib/rbac/permissions.ts`.
 *
 * Employees can push past an unmet stage gate. That used to be admin-only;
 * the gate now informs rather than blocks, and the written reason is what
 * gets kept. The line below says so, so this panel does not contradict the
 * matrix an employee actually hits.
 */
export const ROLE_COPY: Record<
  Role,
  { dot: string; lines: { ok: boolean; text: string }[] }
> = {
  ADMIN: {
    dot: "bg-[var(--ink)]",
    lines: [
      { ok: true, text: "Everything an employee can do" },
      { ok: true, text: "All money — value, payments, subsidy, partner payouts" },
      { ok: true, text: "Users, master data, templates, partner rates" },
      { ok: true, text: "Override a stage gate, with a written reason" },
    ],
  },
  EMPLOYEE: {
    dot: "bg-[var(--link)]",
    lines: [
      { ok: true, text: "Leads, prospects, all nine stages" },
      { ok: true, text: "Documents, packs, site surveys, field uploads" },
      { ok: true, text: "Push past an unmet stage gate, with a written reason" },
      { ok: false, text: "Any amount at all" },
      { ok: false, text: "Users, master data and templates" },
    ],
  },
  INSTALLER: {
    dot: "bg-[var(--orange)]",
    lines: [
      { ok: true, text: "Site survey, stages 3 and 4 on assigned projects" },
      { ok: true, text: "Upload photos and post-installation details" },
      { ok: false, text: "Any amount, plan or financial document" },
    ],
  },
  PARTNER: {
    dot: "bg-[var(--partner-text)]",
    lines: [
      { ok: true, text: "Their own referrals and what each one earns" },
      { ok: true, text: "Submit a new referral" },
      { ok: false, text: "Customer pricing, documents or anyone else’s referrals" },
    ],
  },
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
  INSTALLER: "Installer",
  PARTNER: "Channel partner",
};

export const ROLE_CHIP: Record<Role, string> = {
  ADMIN: "border border-[var(--navy-border)] bg-[var(--navy)] text-[var(--navy-ink)]",
  EMPLOYEE: "bg-[var(--navy-soft)] text-[var(--link)]",
  INSTALLER: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  PARTNER: "bg-[var(--partner-soft)] text-[var(--partner-text)]",
};
