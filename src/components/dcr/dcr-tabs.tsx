import Link from "next/link";

const TABS = [
  { key: "dashboard", href: "/dcr/dashboard", label: "Dashboard" },
  { key: "certificates", href: "/dcr", label: "Certificates" },
  { key: "suppliers", href: "/dcr/suppliers", label: "Suppliers" },
] as const;

export function DcrTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="mb-4.5 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold no-underline ${
            t.key === active
              ? "border-[var(--orange)] text-[var(--ink)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
