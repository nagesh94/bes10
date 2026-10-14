"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The search box, the filters and the pager that sit on a long list.
 *
 * Shared rather than written twice, because quotations and agreements are
 * the same list with different columns, and a third list is a matter of time.
 *
 * All of it is query string: changing a filter is a navigation, so the
 * server re-renders with exactly the rows asked for and nothing is fetched
 * that is not shown. That is the point of the whole exercise — page one of
 * a thousand quotations reads twenty-five rows out of the database, not a
 * thousand.
 */

export interface ListFilter {
  /** The query-string key, e.g. "status". */
  name: string;
  /** Shown as the "all" option, e.g. "Any status". */
  anyLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Changing anything but the page returns to page one; staying on page 9 of a
 * list that now has two pages shows an empty table and looks broken. */
function withParam(
  current: URLSearchParams,
  changes: Record<string, string>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  if (!("page" in changes)) next.delete("page");
  const query = next.toString();
  return query ? `?${query}` : "";
}

export function ListControls({
  placeholder,
  filters,
  perOptions,
  per,
}: {
  placeholder: string;
  filters: readonly ListFilter[];
  perOptions: readonly number[];
  per: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The box is typed into, so it holds its own value; it is pushed to the URL
  // on submit rather than on every keystroke, which would navigate per letter.
  const [term, setTerm] = useState(params.get("q") ?? "");
  useEffect(() => {
    setTerm(params.get("q") ?? "");
  }, [params]);

  function go(changes: Record<string, string>) {
    router.push(`${pathname}${withParam(params, changes)}`);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        go({ q: term.trim() });
      }}
      className="mb-4 flex flex-wrap items-center gap-2.5"
    >
      <div className="flex min-w-56 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-[var(--muted-soft)]" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 w-full bg-transparent text-[13.5px] text-[var(--ink)] outline-none"
        />
      </div>

      {filters.map((filter) => (
        <select
          key={filter.name}
          value={params.get(filter.name) ?? ""}
          aria-label={filter.anyLabel}
          onChange={(event) => go({ [filter.name]: event.target.value })}
          className="h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[13px] font-medium text-[var(--ink)]"
        >
          <option value="">{filter.anyLabel}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)]">
        Show
        <select
          value={String(per)}
          aria-label="Rows per page"
          onChange={(event) => go({ per: event.target.value })}
          className="h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-2 text-[13px] font-medium text-[var(--ink)]"
        >
          {perOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {/* Submitting is Enter in the box; this is for a thumb on a phone. */}
      <button
        type="submit"
        className="h-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 text-[13px] font-bold text-[var(--ink)]"
      >
        Search
      </button>
    </form>
  );
}

/**
 * Previous and next, and where you are.
 *
 * Numbered pages are deliberately not offered: with a search box and filters
 * above, nobody navigates to page 7 of quotations — they narrow instead.
 */
export function ListPager({
  total,
  page,
  per,
  noun,
}: {
  total: number;
  page: number;
  per: number;
  /** Plural, lowercase: "quotations". */
  noun: string;
}) {
  const params = useSearchParams();
  const pathname = usePathname();

  const pages = Math.max(1, Math.ceil(total / per));
  const first = total === 0 ? 0 : (page - 1) * per + 1;
  const last = Math.min(page * per, total);

  const href = (target: number) =>
    `${pathname}${withParam(params, { page: target > 1 ? String(target) : "" })}`;

  const step =
    "flex h-9 items-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-bold no-underline";

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-3">
      <p className="flex-1 text-[12.5px] text-[var(--muted)]">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            Showing <span className="ref font-semibold text-[var(--ink)]">{first}–{last}</span> of{" "}
            <span className="ref font-semibold text-[var(--ink)]">{total}</span> {noun}
          </>
        )}
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${step} text-[var(--ink)]`} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={`${step} cursor-not-allowed text-[var(--muted-soft)] opacity-60`}>
            ← Previous
          </span>
        )}

        <span className="text-[12.5px] font-semibold text-[var(--muted)]">
          Page {page} of {pages}
        </span>

        {page < pages ? (
          <Link href={href(page + 1)} className={`${step} text-[var(--ink)]`} rel="next">
            Next →
          </Link>
        ) : (
          <span className={`${step} cursor-not-allowed text-[var(--muted-soft)] opacity-60`}>
            Next →
          </span>
        )}
      </div>
    </div>
  );
}
