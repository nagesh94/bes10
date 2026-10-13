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
 */

export type Role = "ADMIN" | "EMPLOYEE" | "INSTALLER" | "PARTNER";

export interface RoleInfo {
  value: Role;
  label: string;
  note: string;
}

export const ROLES: RoleInfo[] = [
  { value: "ADMIN", label: "Admin", note: "Everything, including money and user accounts" },
  { value: "EMPLOYEE", label: "Employee", note: "The whole pipeline except money and admin" },
  {
    value: "INSTALLER",
    label: "Installer",
    note: "Only jobs assigned to them — the site survey and the post-installation details",
  },
  { value: "PARTNER", label: "Partner", note: "Only their own referrals and commission" },
];
