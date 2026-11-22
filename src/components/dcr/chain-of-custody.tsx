import type { DcrChainStep } from "@/lib/db/schema/dcr";

/**
 * The NISE chain of custody, collapsed to one line by default.
 *
 * A certificate that has passed through several distributors can list
 * dozens of steps, so the list opens on demand and scrolls inside a fixed
 * height instead of pushing the rest of the page down. A native <details>
 * so it works in server components and needs no script.
 */
export function ChainOfCustody({ chain, className = "" }: { chain: DcrChainStep[]; className?: string }) {
  if (chain.length === 0) return null;
  const first = chain[0]?.party;
  const last = chain.at(-1)?.party;

  return (
    <details className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="inline-block text-[11px] text-[var(--muted)] transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span className="text-[15px] font-bold">Chain of custody</span>
        <span className="rounded-full bg-[var(--chip-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--chip-text)]">
          {chain.length} step{chain.length === 1 ? "" : "s"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--muted)] group-open:hidden">
          {first && last && first !== last ? `${first} → ${last}` : (last ?? "")}
        </span>
      </summary>
      <ol className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {chain.map((c, i) => (
          <li key={i} className="flex gap-3 text-[12.5px]">
            <span className="ref w-22 shrink-0 text-[var(--muted)]">{c.date ?? "—"}</span>
            <span className="min-w-0">
              <strong>{c.event}</strong>
              {c.party ? ` — ${c.party}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
