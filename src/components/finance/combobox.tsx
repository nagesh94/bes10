"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

/**
 * A dropdown you can type into.
 *
 * A `<select>` of every project the company has ever had is unusable past a
 * few dozen; `<datalist>` cannot carry an id separately from its label and
 * looks different in every browser. This is the small thing in between:
 * type to narrow, arrows and Enter to pick, Escape to close.
 */

export interface ComboOption {
  value: string;
  label: string;
  /** A second line, e.g. a category's examples. */
  hint?: string | null;
}

export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyLabel,
  invalid = false,
}: {
  id: string;
  options: readonly ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** When given, offers a clear button that sets the value to "". */
  emptyLabel?: string;
  invalid?: boolean;
}) {
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q))
      : options;
    return list.slice(0, 60);
  }, [options, query]);

  useEffect(() => setActive(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(option: ComboOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrap} className="relative">
      <div
        className={`flex h-11 items-center rounded-lg border bg-[var(--surface)] pr-1 focus-within:border-[var(--orange)] ${
          invalid ? "border-[var(--red-border)]" : "border-[var(--line)]"
        }`}
      >
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected && open ? selected.label : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              const m = matches[active];
              if (m) pick(m);
            } else if (e.key === "Escape" && open) {
              // Keep Escape from also closing a dialog around this.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-[var(--ink)] outline-none"
        />
        {emptyLabel && value ? (
          <button
            type="button"
            aria-label={emptyLabel}
            title={emptyLabel}
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show options"
          onClick={() => {
            setOpen((o) => !o);
            input.current?.focus();
          }}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-2)]"
        >
          <ChevronDown size={15} aria-hidden />
        </button>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow-float)]"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-[13px] text-[var(--muted)]">Nothing matches “{query}”.</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${i === active ? "bg-[var(--surface-2)]" : ""}`}
              >
                <div className={`text-[13.5px] ${o.value === value ? "font-bold" : "font-medium"}`}>{o.label}</div>
                {o.hint ? <div className="text-[11.5px] text-[var(--muted)]">{o.hint}</div> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
