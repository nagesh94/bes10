import { getTranslations } from "next-intl/server";
import { can, hasRole, type Actor } from "@/lib/rbac/permissions";

export type NavKey =
  | "dashboard"
  | "leads"
  | "projects"
  | "quotations"
  | "agreements"
  | "finance"
  | "partners"
  | "documents"
  | "admin"
  | "myJobs"
  | "myReferrals";

export interface NavItem {
  href: string;
  key: NavKey;
  label: string;
}

/**
 * The menu, built once and handed to whichever chrome is on screen — the
 * desktop rail, the tablet's top bar, or the phone's tab bar.
 *
 * Built from the same permission matrix the server enforces, so a link
 * never appears for something the action would refuse.
 */
export async function visibleNavItems(actor: Actor): Promise<NavItem[]> {
  const t = await getTranslations();

  const items: Array<{ href: string; key: NavKey; show: boolean }> = [
    { href: "/dashboard", key: "dashboard", show: can(actor, "project.write") },
    { href: "/leads", key: "leads", show: can(actor, "lead.read") },
    { href: "/projects", key: "projects", show: can(actor, "project.write") },
    { href: "/quotations", key: "quotations", show: can(actor, "quotation.read") },
    { href: "/agreements", key: "agreements", show: can(actor, "agreement.read") },
    { href: "/finance", key: "finance", show: can(actor, "money.read") },
    { href: "/partners", key: "partners", show: can(actor, "partner.read") },
    { href: "/documents", key: "documents", show: can(actor, "document.read") },
    { href: "/admin/users", key: "admin", show: can(actor, "admin.users") },
    { href: "/installer", key: "myJobs", show: hasRole(actor, "INSTALLER") },
    { href: "/my-referrals", key: "myReferrals", show: hasRole(actor, "PARTNER") },
  ];

  return items
    .filter((item) => item.show)
    .map((item) => ({ href: item.href, key: item.key, label: t(`nav.${item.key}`) }));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
