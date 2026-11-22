"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The finance section's own tabs, drawn exactly as the admin tabs are.
 *
 * The date range rides along between tabs: someone looking at "last quarter"
 * on the dashboard who clicks through to payments wants last quarter there
 * too. Customer filters do not — they mean different things per tab.
 */
const TABS = [
  { href: "/finance", label: "dashboard", exact: true },
  { href: "/finance/expenses", label: "expenses", exact: false },
  { href: "/finance/gst", label: "gst", exact: false },
  { href: "/finance/loans", label: "loans", exact: false },
] as const;

export function FinanceTabs() {
  const t = useTranslations("finance.tabs");
  const path = usePathname();
  const params = useSearchParams();

  const carry = new URLSearchParams();
  for (const key of ["from", "to", "range"]) {
    const v = params.get(key);
    if (v) carry.set(key, v);
  }
  const suffix = carry.toString() ? `?${carry.toString()}` : "";

  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6">
      <div className="mx-auto flex max-w-[1280px] flex-wrap gap-0.5">
        {TABS.map((tab) => {
          const active = tab.exact ? path === tab.href : path.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${suffix}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "px-3.5 py-[13px] text-sm font-semibold text-[var(--ink)] no-underline shadow-[inset_0_-2.5px_0_var(--orange)]"
                  : "px-3.5 py-[13px] text-sm font-medium text-[var(--muted)] no-underline hover:text-[var(--ink)]"
              }
            >
              {t(tab.label)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
