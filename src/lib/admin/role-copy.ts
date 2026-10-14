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
      { ok: true, text: "Everything an executive can do" },
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

/**
 * EMPLOYEE reads as "Executive" — the office's own word for the job. The
 * stored enum value is unchanged, so no permission check or migration turns
 * on a piece of wording.
 */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EMPLOYEE: "Executive",
  INSTALLER: "Installer",
  PARTNER: "Channel partner",
};

/**
 * The role chip, as the users board draws it.
 *
 * Each pairing is a soft ground with its own text tone from the same family,
 * which is the one combination that holds up in both themes. `--navy` as
 * text on `--navy-soft` does not: in dark mode they are within a hair of
 * each other and the chip reads as an empty pill. `--link` is the readable
 * member of that family and is what belongs here.
 */
export const ROLE_CHIP: Record<Role, string> = {
  ADMIN: "bg-[var(--orange-soft)] text-[var(--orange-text)]",
  EMPLOYEE: "bg-[var(--navy-soft)] text-[var(--link)]",
  INSTALLER: "bg-[var(--green-soft)] text-[var(--green-text)]",
  PARTNER: "bg-[var(--partner-soft)] text-[var(--partner-text)]",
};

/**
 * Chip wording. Shorter than ROLE_LABEL on purpose: a row may carry four of
 * these, and "Channel partner" is too wide to sit beside three others.
 */
export const ROLE_CHIP_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  EMPLOYEE: "Executive",
  INSTALLER: "Installer",
  PARTNER: "Partner",
};
