import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { primaryRole, type Actor } from "@/lib/rbac/permissions";
import { BottomNav } from "./bottom-nav";
import { initials, type NavItem } from "./nav-items";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export type { NavKey } from "./nav-items";

/**
 * The app bar — the phone's and the tablet's chrome.
 *
 * Deep module glass in both themes, with the logo's own underline running
 * beneath it as a horizon. A dark bar over a light canvas is what makes the
 * installed app read as an app rather than a page someone bookmarked, and
 * it means the phone's status bar is the same colour whichever theme is on.
 *
 * On a phone the row of links is replaced by the tab bar at the bottom,
 * where a thumb can reach it. From `lg` up the bar is gone entirely and the
 * whole menu lives in the rail down the left — a desktop window is wide and
 * short, so navigation belongs in the dimension there is room in.
 */
export async function AppHeader({
  actor,
  name,
  items,
}: {
  actor: Actor;
  name: string;
  items: NavItem[];
}) {
  const t = await getTranslations();

  return (
    <>
      <header className="sticky top-0 z-40 bg-[var(--chrome)] pt-[env(safe-area-inset-top)] lg:hidden">
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

          <NavLinks items={items} />

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0 md:gap-2.5">
            {/* One chip, widest role first: an admin who also installs reads
                as "Admin". The full set is on the settings page, where there
                is room to list it. */}
            <span
              title={actor.roles.map((role) => t(`roles.${role}`)).join(" · ")}
              className="hidden rounded-[var(--radius-chip)] border border-[var(--chrome-line)] px-2 py-[5px] text-[10.5px] font-bold tracking-[0.08em] text-[var(--chrome-muted)] uppercase sm:inline"
            >
              {t(`roles.${primaryRole(actor.roles)}`)}
              {actor.roles.length > 1 ? ` +${actor.roles.length - 1}` : ""}
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
        items={items}
        settingsLabel={t("nav.settings")}
        moreLabel={t("nav.more")}
        signOutLabel={t("auth.signOut")}
      />
    </>
  );
}
