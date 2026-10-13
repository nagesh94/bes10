"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users & roles" },
  { href: "/admin/master", label: "Master data" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminTabs() {
  const path = usePathname();

  return (
    <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6">
      <div className="mx-auto flex max-w-[1280px] flex-wrap gap-0.5">
        {TABS.map((tab) => {
          const active = path === tab.href || path.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "px-3.5 py-[13px] text-sm font-semibold text-[var(--ink)] no-underline shadow-[inset_0_-2.5px_0_var(--orange)]"
                  : "px-3.5 py-[13px] text-sm font-medium text-[var(--muted)] no-underline hover:text-[var(--ink)]"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
