"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { PER_PAGE_OPTIONS } from "@/lib/list/params";

/**
 * One row of filters above the finance tabs.
 *
 * Everything is query string, as on the quotation and agreement lists: a
 * filtered view can be bookmarked or sent on WhatsApp, and the server renders
 * exactly what was asked for. The date range is a set of presets with a
 * custom pair of inputs behind them — almost nobody wants 3 March to 17 May,
 * and everyone wants "this financial year".
 */

export interface FinanceFilter {
  name: string;
  anyLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Indian financial year: April to March. */
function presetRange(key: string): { from: string; to: string } | null {
  const now = new Date();
  const today = iso(now);
  const back = (months: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - months);
    return iso(d);
  };
  switch (key) {
    case "month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { from: iso(d), to: today };
    }
    case "3m":
      return { from: back(3), to: today };
    case "fy": {
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { from: `${startYear}-04-01`, to: today };
    }
    case "lastfy": {
      const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - 1;
      return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
    }
    case "12m":
      return { from: back(12), to: today };
    default:
      return null;
  }
}

const PRESETS = [
  { key: "", label: "All time" },
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "3m", label: "Last 3 months" },
  { key: "fy", label: "This financial year" },
  { key: "lastfy", label: "Last financial year" },
  { key: "12m", label: "Last 12 months" },
  { key: "custom", label: "Custom dates…" },
] as const;

const control =
  "h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] font-medium text-[var(--ink)]";

export function FinanceFilters({
  placeholder,
  filters,
  sort,
  showDates = true,
  per,
}: {
  placeholder: string;
  filters: readonly FinanceFilter[];
  sort?: FinanceFilter;
  showDates?: boolean;
  /** Current rows per page; shows the "Show" control when given. */
  per?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [term, setTerm] = useState(params.get("q") ?? "");
  useEffect(() => setTerm(params.get("q") ?? ""), [params]);

  const range = params.get("range") ?? (params.get("from") || params.get("to") ? "custom" : "");

  function go(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any change but the page itself starts again at page one.
    if (!("page" in changes)) next.delete("page");
    const query = next.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function pickRange(key: string) {
    if (key === "custom") return go({ range: "custom" });
    const r = presetRange(key);
    go({ range: key, from: r?.from ?? "", to: r?.to ?? "" });
  }

  const active = filters
    .map((f) => {
      const v = params.get(f.name);
      const opt = f.options.find((o) => o.value === v);
      return v && opt ? { name: f.name, label: opt.label } : null;
    })
    .filter(Boolean) as Array<{ name: string; label: string }>;
  const q = params.get("q");

  return (
    <div className="mb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: term.trim() });
        }}
        className="flex flex-wrap items-center gap-2.5"
      >
        <div className="flex min-w-56 flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3">
          <Search size={15} strokeWidth={2.2} className="shrink-0 text-[var(--muted-soft)]" aria-hidden />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-10 w-full bg-transparent text-[13.5px] text-[var(--ink)] outline-none"
          />
        </div>

        {filters.map((f) => (
          <select
            key={f.name}
            value={params.get(f.name) ?? ""}
            aria-label={f.anyLabel}
            onChange={(e) => go({ [f.name]: e.target.value })}
            className={control}
          >
            <option value="">{f.anyLabel}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}

        {showDates ? (
          <label className="flex items-center gap-1.5">
            <CalendarDays size={15} className="text-[var(--muted)]" aria-hidden />
            <select
              value={range}
              aria-label="Date range"
              onChange={(e) => pickRange(e.target.value)}
              className={control}
            >
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {sort ? (
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)]">
            Sort
            <select
              value={params.get(sort.name) ?? sort.options[0]?.value ?? ""}
              aria-label={sort.anyLabel}
              onChange={(e) => go({ [sort.name]: e.target.value })}
              className={control}
            >
              {sort.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {per ? (
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)]">
            Show
            <select
              value={String(per)}
              aria-label="Rows per page"
              onChange={(e) => go({ per: e.target.value })}
              className={control}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} rows
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="submit"
          className="h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-[13px] font-bold text-[var(--ink)]"
        >
          Search
        </button>
      </form>

      {showDates && range === "custom" ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-[var(--muted)]">
          From
          <input
            type="date"
            value={params.get("from") ?? ""}
            onChange={(e) => go({ from: e.target.value, range: "custom" })}
            className={control}
          />
          to
          <input
            type="date"
            value={params.get("to") ?? ""}
            onChange={(e) => go({ to: e.target.value, range: "custom" })}
            className={control}
          />
        </div>
      ) : null}

      {active.length || q ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {q ? (
            <Chip label={`“${q}”`} onClear={() => go({ q: "" })} />
          ) : null}
          {active.map((a) => (
            <Chip key={a.name} label={a.label} onClear={() => go({ [a.name]: "" })} />
          ))}
          <button
            type="button"
            onClick={() => {
              const keep = new URLSearchParams();
              for (const k of ["from", "to", "range", "sort", "per"]) {
                const v = params.get(k);
                if (v) keep.set(k, v);
              }
              const s = keep.toString();
              router.push(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
            }}
            className="cursor-pointer text-[12.5px] font-semibold text-[var(--navy-text)] underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--navy-border)] bg-[var(--navy-soft)] py-1 pr-1.5 pl-3 text-[12px] font-semibold text-[var(--navy-text)]">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-[var(--navy-border)]"
      >
        <X size={12} strokeWidth={2.6} aria-hidden />
      </button>
    </span>
  );
}
