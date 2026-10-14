/**
 * The four roles, described in plain words.
 *
 * This lives outside both the client component and the server action on
 * purpose. A plain value exported from a `"use client"` module is replaced by
 * a client reference when the server imports it, so reading it in a server
 * component fails at runtime with "ROLES.map is not a function" — the same
 * trap as exporting a plain object from a `"use server"` file.
 *
 * The descriptions are kept honest against `PERMISSIONS`: if a role's reach
 * changes there, this text has to change with it.
 *
 * An account can hold several of these at once, so each note describes what
 * that role adds rather than what the person is limited to.
 */

import type { Role } from "./permissions";

export type { Role };

export interface RoleInfo {
  value: Role;
  label: string;
  note: string;
}

/**
 * EMPLOYEE is shown as "Executive" — that is what the office calls the job.
 * The stored value stays EMPLOYEE so no permission check or migration turns
 * on a piece of wording.
 */
export const ROLES: RoleInfo[] = [
  { value: "ADMIN", label: "Admin", note: "Everything, including money and user accounts" },
  { value: "EMPLOYEE", label: "Executive", note: "The whole pipeline except money and admin" },
  {
    value: "INSTALLER",
    label: "Installer",
    note: "Jobs assigned to them — the site survey and the post-installation details",
  },
  { value: "PARTNER", label: "Partner", note: "Their own referrals and commission" },
];

export const ROLE_INFO: Record<Role, RoleInfo> = Object.fromEntries(
  ROLES.map((r) => [r.value, r]),
) as Record<Role, RoleInfo>;
