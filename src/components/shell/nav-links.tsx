"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PREFIX: Record<string, string> = {
  dashboard: "/dashboard",
  leads: "/leads",
  projects: "/projects",
  quotations: "/quotations",
  agreements: "/agreements",
  partners: "/partners",
  documents: "/documents",
  admin: "/admin",
  myJobs: "/installer",
  myReferrals: "/my-referrals",
};

export function isActive(path: string, key: string, href: string) {
  const prefix = PREFIX[key] ?? href;
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The desktop links. A phone gets the tab bar instead, so this row simply
 * is not there below md.
 */
export function NavLinks({
  items,
}: {
  items: { href: string; key: string; label: string }[];
}) {
  const path = usePathname();

  return (
    <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
      {items.map((item) => {
        const active = isActive(path, item.key, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "relative rounded-[var(--radius-control)] bg-[var(--chrome-2)] px-3 py-2 text-[13.5px] font-semibold text-[var(--chrome-ink)] no-underline after:absolute after:inset-x-3 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-[var(--gold)] after:content-['']"
                : "rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] font-medium text-[var(--chrome-muted)] no-underline hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
