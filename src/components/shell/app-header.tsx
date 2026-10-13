import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can, type Actor } from "@/lib/rbac/permissions";
import { BottomNav } from "./bottom-nav";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export type NavKey =
  | "dashboard"
  | "leads"
  | "projects"
  | "quotations"
  | "agreements"
  | "partners"
  | "documents"
  | "admin"
  | "myJobs"
  | "myReferrals";

interface NavItem {
  href: string;
  key: NavKey;
  show: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The app bar.
 *
 * Deep module glass in both themes, with the logo's own underline running
 * beneath it as a horizon. A dark bar over a light canvas is what makes the
 * installed app read as an app rather than a page someone bookmarked, and
 * it means the phone's status bar is the same colour whichever theme is on.
 *
 * On a phone the row of links is replaced by the tab bar at the bottom,
 * where a thumb can reach it.
 */
export async function AppHeader({ actor, name }: { actor: Actor; name: string }) {
  const t = await getTranslations();

  // The menu is built from the same matrix the server enforces, so a link
  // never appears for something the action would refuse.
  const items: NavItem[] = [
    {
      href: "/dashboard",
      key: "dashboard",
      show: can(actor, "project.read") && actor.role !== "PARTNER" && actor.role !== "INSTALLER",
    },
    { href: "/leads", key: "leads", show: can(actor, "lead.read") },
    {
      href: "/projects",
      key: "projects",
      show: actor.role === "ADMIN" || actor.role === "EMPLOYEE",
    },
    { href: "/quotations", key: "quotations", show: can(actor, "quotation.read") },
    { href: "/agreements", key: "agreements", show: can(actor, "agreement.read") },
    { href: "/partners", key: "partners", show: can(actor, "partner.read") },
    { href: "/documents", key: "documents", show: can(actor, "document.read") },
    { href: "/admin/users", key: "admin", show: can(actor, "admin.users") },
    { href: "/installer", key: "myJobs", show: actor.role === "INSTALLER" },
    { href: "/my-referrals", key: "myReferrals", show: actor.role === "PARTNER" },
  ];

  const visible = items
    .filter((item) => item.show)
    .map((item) => ({ href: item.href, key: item.key, label: t(`nav.${item.key}`) }));

  return (
    <>
      <header className="sticky top-0 z-40 bg-[var(--chrome)] pt-[env(safe-area-inset-top)]">
        <div className="flex min-h-[58px] items-center gap-5 px-4 md:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center" aria-label={t("app.name")}>
            <Image
              src="/brand/wordmark-on-dark.png"
              alt="BHIM Energy Solutions"
              width={471}
              height={144}
              priority
              className="h-[26px] w-auto"
            />
          </Link>

          <NavLinks items={visible} />

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0 md:gap-2.5">
            <span className="hidden rounded-[var(--radius-chip)] border border-[var(--chrome-line)] px-2 py-[5px] text-[10.5px] font-bold tracking-[0.08em] text-[var(--chrome-muted)] uppercase sm:inline">
              {t(`roles.${actor.role}`)}
            </span>
            <Link
              href="/settings"
              title={name}
              aria-label={t("nav.settings")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--chrome-2)] text-[13px] font-bold text-[var(--chrome-ink)] no-underline ring-1 ring-[var(--chrome-line)] hover:bg-[var(--navy)]"
            >
              {initials(name)}
            </Link>
            <span className="hidden md:block">
              <SignOutButton label={t("auth.signOut")} onChrome />
            </span>
          </div>
        </div>
        <div aria-hidden className="seam" />
      </header>

      <BottomNav
        items={visible}
        settingsLabel={t("nav.settings")}
        moreLabel={t("nav.more")}
        signOutLabel={t("auth.signOut")}
      />
    </>
  );
}
