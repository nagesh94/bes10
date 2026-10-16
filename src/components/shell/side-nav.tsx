"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, Settings } from "lucide-react";
import { NAV_ICON } from "./nav-icons";
import { isActive } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

const STORE_KEY = "bes.sidenav.collapsed";

type Item = { href: string; key: string; label: string };

/**
 * The desktop navigation.
 *
 * On a Windows desktop the window is wide and short: a row of links across
 * the top spends the scarce dimension and leaves the plentiful one empty,
 * and it cannot hold every destination without an overflow menu. So from
 * `lg` up the whole menu moves to a rail down the left — same module glass
 * as the app bar, every option visible at once, no "More".
 *
 * It can be narrowed to icons for a 1366px laptop, and that choice is
 * remembered per browser. Below `lg` this is not rendered at all: a phone
 * keeps its tab bar and a tablet keeps the top bar, both unchanged.
 */
export function SideNav({
  items,
  name,
  roleLabel,
  roleTitle,
  settingsLabel,
  signOutLabel,
  appName,
  initials,
}: {
  items: Item[];
  name: string;
  roleLabel: string;
  roleTitle: string;
  settingsLabel: string;
  signOutLabel: string;
  appName: string;
  initials: string;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the stored choice after mount: the server has no way to know it,
  // and rendering it on the server would mismatch.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORE_KEY) === "1");
    } catch {
      /* private mode — the rail simply stays wide */
    }
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(STORE_KEY, next ? "1" : "0");
      } catch {
        /* nothing to remember it with; the session still works */
      }
      return next;
    });
  }

  const settingsActive = isActive(path, "settings", "/settings");

  return (
    <aside
      data-collapsed={collapsed ? "" : undefined}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-[var(--chrome)] lg:flex ${
        collapsed ? "w-[72px]" : "w-[244px]"
      }`}
    >
      {/* The logo's own underline, turned on its side: the seam runs down
          the inside edge of the rail the way it runs under the app bar. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-[3px]"
        style={{
          background:
            "linear-gradient(180deg, var(--green) 0%, var(--gold) 38%, var(--orange) 52%, var(--navy) 100%)",
        }}
      />

      <div className={`flex min-h-[64px] items-center ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <Link href="/dashboard" className="flex min-w-0 items-center" aria-label={appName}>
          {/* The emblem is drawn for a white ground and the wordmark for a
              dark one, so the narrow rail puts the emblem on its own white
              chip rather than losing it against the glass. */}
          {collapsed ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-white p-[3px]">
              <Image
                src="/brand/bhim-emblem.png"
                alt="BHIM Energy Solutions"
                width={500}
                height={500}
                priority
                className="h-full w-full object-contain"
              />
            </span>
          ) : (
            <Image
              src="/brand/wordmark-on-dark.png"
              alt="BHIM Energy Solutions"
              width={471}
              height={144}
              priority
              className="h-[26px] w-auto"
            />
          )}
        </Link>
      </div>

      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {items.map((item) => {
            const Icon = NAV_ICON[item.key] ?? Settings;
            const active = isActive(path, item.key, item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] no-underline ${
                    collapsed ? "justify-center px-0" : "px-3"
                  } ${
                    active
                      ? "bg-[var(--chrome-2)] font-semibold text-[var(--chrome-ink)]"
                      : "font-medium text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)]"
                  }`}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-[7px] left-0 w-[3px] rounded-r-full bg-[var(--gold)]"
                    />
                  ) : null}
                  <Icon
                    size={19}
                    strokeWidth={active ? 2.25 : 1.9}
                    className={active ? "shrink-0 text-[var(--gold)]" : "shrink-0"}
                  />
                  {collapsed ? null : (
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--chrome-line)] px-2.5 py-2.5">
        <Link
          href="/settings"
          title={collapsed ? `${name} · ${settingsLabel}` : undefined}
          aria-current={settingsActive ? "page" : undefined}
          className={`flex min-h-12 items-center gap-2.5 rounded-[var(--radius-control)] no-underline ${
            collapsed ? "justify-center px-0" : "px-2"
          } ${
            settingsActive
              ? "bg-[var(--chrome-2)]"
              : "hover:bg-[var(--chrome-2)]"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--chrome-2)] text-[12px] font-bold text-[var(--chrome-ink)] ring-1 ring-[var(--chrome-line)]">
            {initials}
          </span>
          {collapsed ? null : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--chrome-ink)]">
                {name}
              </span>
              {/* Widest role first; the full set is on the settings page. */}
              <span
                title={roleTitle}
                className="block truncate text-[10.5px] font-bold tracking-[0.08em] text-[var(--chrome-muted)] uppercase"
              >
                {roleLabel}
              </span>
            </span>
          )}
        </Link>

        <div className={`mt-1.5 flex items-center gap-1.5 ${collapsed ? "flex-col" : ""}`}>
          <span className={collapsed ? "" : "min-w-0 flex-1"}>
            <SignOutButton label={signOutLabel} onChrome compact={!collapsed} iconOnly={collapsed} />
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand the menu" : "Collapse the menu"}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--chrome-muted)] hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)]"
          >
            {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
