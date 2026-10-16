"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MoreHorizontal, Settings } from "lucide-react";
import { NAV_ICON } from "./nav-icons";
import { isActive } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

type Item = { href: string; key: string; label: string };

/**
 * The phone's navigation.
 *
 * Four destinations stay on the bar and anything else goes behind More,
 * because a fifth and sixth tab on a 360px screen is a 60px target with a
 * truncated label. The bar is the same module glass as the app bar, so in
 * an installed app the screen is held top and bottom by the product's own
 * colour rather than by the browser's.
 */
export function BottomNav({
  items,
  settingsLabel,
  moreLabel,
  signOutLabel,
}: {
  items: Item[];
  settingsLabel: string;
  moreLabel: string;
  signOutLabel: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // A navigation closes the sheet; so does Escape.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (items.length === 0) return null;

  const primary = items.length > 5 ? items.slice(0, 4) : items.slice(0, 5);
  const overflow = items.slice(primary.length);
  const overflowActive = overflow.some((i) => isActive(path, i.key, i.href));

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[rgb(3_11_22/0.55)]"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[18px] border-t border-[var(--chrome-line)] bg-[var(--chrome)] px-3 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+14px)] shadow-[var(--shadow-float)]">
            <div
              aria-hidden
              className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--chrome-line)]"
            />
            <ul className="grid gap-1">
              {[...overflow, { href: "/settings", key: "settings", label: settingsLabel }].map(
                (item) => {
                  const Icon = NAV_ICON[item.key] ?? Settings;
                  const active = isActive(path, item.key, item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={`flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] no-underline ${
                          active
                            ? "bg-[var(--chrome-2)] font-semibold text-[var(--chrome-ink)]"
                            : "font-medium text-[var(--chrome-muted)]"
                        }`}
                      >
                        <Icon
                          size={19}
                          strokeWidth={2}
                          className={active ? "text-[var(--gold)]" : ""}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                },
              )}
            </ul>
            {/* Sign out lives only here on a phone — the app bar drops it
                for width, so the sheet has to carry it. */}
            <div className="mt-2 border-t border-[var(--chrome-line)] pt-2">
              <SignOutButton label={signOutLabel} onChrome inSheet />
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--chrome-line)] bg-[var(--chrome)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid auto-cols-fr grid-flow-col">
          {primary.map((item) => {
            const Icon = NAV_ICON[item.key] ?? Settings;
            const active = isActive(path, item.key, item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 py-1.5 no-underline"
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-[22%] top-0 h-[2px] rounded-b-full bg-[var(--gold)]"
                    />
                  ) : null}
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.25 : 1.9}
                    className={active ? "text-[var(--gold)]" : "text-[var(--chrome-muted)]"}
                  />
                  <span
                    className={`max-w-full truncate text-[10.5px] ${
                      active
                        ? "font-bold text-[var(--chrome-ink)]"
                        : "font-medium text-[var(--chrome-muted)]"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {overflow.length ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="relative flex min-h-[58px] w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 py-1.5"
              >
                {overflowActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-[22%] top-0 h-[2px] rounded-b-full bg-[var(--gold)]"
                  />
                ) : null}
                <MoreHorizontal
                  size={20}
                  strokeWidth={overflowActive ? 2.25 : 1.9}
                  className={overflowActive ? "text-[var(--gold)]" : "text-[var(--chrome-muted)]"}
                />
                <span
                  className={`text-[10.5px] ${
                    overflowActive
                      ? "font-bold text-[var(--chrome-ink)]"
                      : "font-medium text-[var(--chrome-muted)]"
                  }`}
                >
                  {moreLabel}
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}
