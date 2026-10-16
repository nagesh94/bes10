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
 * The tablet's links.
 *
 * A phone gets the tab bar instead and a desktop gets the rail, so this row
 * only has to serve the band between them. Ten labels do not fit across a
 * 768px tablet, so the row scrolls rather than growing under the avatar —
 * which is what it used to do, hiding the last two destinations behind it.
 */
export function NavLinks({
  items,
}: {
  items: { href: string; key: string; label: string }[];
}) {
  const path = usePathname();

  return (
    <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active = isActive(path, item.key, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "relative shrink-0 whitespace-nowrap rounded-[var(--radius-control)] bg-[var(--chrome-2)] px-3 py-2 text-[13.5px] font-semibold text-[var(--chrome-ink)] no-underline after:absolute after:inset-x-3 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-[var(--gold)] after:content-['']"
                : "shrink-0 whitespace-nowrap rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] font-medium text-[var(--chrome-muted)] no-underline hover:bg-[var(--chrome-2)] hover:text-[var(--chrome-ink)]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
