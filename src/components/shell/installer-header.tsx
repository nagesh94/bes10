import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignOutButton } from "./sign-out-button";

/**
 * The installer's whole chrome.
 *
 * An installer has no pipeline to navigate — one job list and two forms per
 * job — so there is no nav row at all. What is left is sized for a phone held
 * in one hand on a roof: a 56px sticky bar, nothing smaller than 44px to hit,
 * and the sign-out and settings tucked behind the avatar rather than taking
 * width from the title.
 */
export async function InstallerHeader({ name }: { name: string }) {
  const t = await getTranslations();

  return (
    <header className="sticky top-0 z-30 bg-[var(--chrome)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/installer" className="flex shrink-0 items-center" aria-label={t("nav.myJobs")}>
          <Image
            src="/brand/wordmark-on-dark.png"
            alt="BHIM Energy Solutions"
            width={471}
            height={144}
            priority
            className="h-[25px] w-auto"
          />
        </Link>

        <span className="ml-auto shrink-0 rounded-[var(--radius-chip)] border border-[var(--chrome-line)] px-2 py-1 text-[10.5px] font-bold tracking-[0.08em] text-[var(--chrome-muted)] uppercase">
          {t("roles.INSTALLER")}
        </span>

        <Link
          href="/settings"
          title={name}
          aria-label={t("nav.settings")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--chrome-2)] text-[13px] font-bold text-[var(--chrome-ink)] no-underline ring-1 ring-[var(--chrome-line)]"
        >
          {name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? "")
            .join("")}
        </Link>
      </div>
      <div aria-hidden className="seam" />
    </header>
  );
}

/** Sits at the foot of the job list, where it cannot be hit by accident. */
export async function InstallerFooter() {
  const t = await getTranslations();
  return (
    <div className="mt-8 flex justify-center">
      <SignOutButton label={t("auth.signOut")} />
    </div>
  );
}
