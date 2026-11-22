"use client";

import { useState } from "react";

/**
 * DCR dashboard charts. Plain HTML, like the finance charts: no library.
 *
 * Colour follows the entity everywhere on the page — Installed is always
 * --data-1, In stock always --data-3, Received always --data-2 — and every
 * figure is set in ink, never in the series colour.
 */

export const SERIES = {
  installed: { label: "Installed", color: "var(--data-1)" },
  inStock: { label: "In stock", color: "var(--data-3)" },
  received: { label: "Received", color: "var(--data-2)" },
} as const;

const n = (v: number) => v.toLocaleString("en-IN");

function niceMax(value: number) {
  if (value <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= value) return Math.max(4, step * pow);
  return 10 * pow;
}

export function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />;
}

export function Legend({ keys }: { keys: (keyof typeof SERIES)[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
          <Swatch color={SERIES[k].color} />
          {SERIES[k].label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Panels received (by certificate date) beside panels installed (by
 * installation date), month by month. One axis: panels.
 */
export function MonthlyFlow({
  months,
}: {
  months: { key: string; label: string; received: number; installed: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...months.flatMap((m) => [m.received, m.installed])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const showEvery = months.length > 18 ? 3 : months.length > 12 ? 2 : 1;
  const empty = months.every((m) => m.received === 0 && m.installed === 0);

  return (
    <div>
      <div className="mb-4">
        <Legend keys={["received", "installed"]} />
      </div>
      {empty ? (
        <p className="flex h-[220px] items-center justify-center rounded-lg bg-[var(--surface-2)] text-[13px] text-[var(--muted)]">
          No panels received or installed in this period.
        </p>
      ) : (
        <>
          <div className="relative flex h-[220px] gap-2 select-none">
            <div className="relative w-8 shrink-0">
              {ticks.map((t) => (
                <span
                  key={t}
                  className="num absolute right-0 -translate-y-1/2 text-[11px] text-[var(--muted-soft)]"
                  style={{ bottom: `${(t / max) * 100}%` }}
                >
                  {Number.isInteger(t) ? n(t) : ""}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              {ticks.map((t) => (
                <span
                  key={t}
                  className={`absolute inset-x-0 block h-px ${t === 0 ? "bg-[var(--line)]" : "bg-[var(--line-soft)]"}`}
                  style={{ bottom: `${(t / max) * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                {months.map((m, i) => (
                  <div
                    key={m.key}
                    tabIndex={0}
                    aria-label={`${m.label}: ${m.received} received, ${m.installed} installed`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-[2px]"
                  >
                    {hover === i ? (
                      <span className="absolute inset-x-[-2px] inset-y-0 rounded-md bg-[var(--data-track)] opacity-60" />
                    ) : null}
                    {(["received", "installed"] as const).map((k) => (
                      <span
                        key={k}
                        className="relative block w-full max-w-[16px] rounded-t-[4px]"
                        style={{
                          height: `${(m[k] / max) * 100}%`,
                          minHeight: m[k] > 0 ? 2 : 0,
                          backgroundColor: SERIES[k].color,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {hover !== null && months[hover] ? (
                <div
                  className="pointer-events-none absolute top-1 z-10 w-44 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow-float)]"
                  style={
                    hover > months.length / 2
                      ? { right: `${100 - ((hover + 0.5) / months.length) * 100}%`, marginRight: 12 }
                      : { left: `${((hover + 0.5) / months.length) * 100}%`, marginLeft: 12 }
                  }
                >
                  <div className="mb-1.5 text-[12px] font-semibold text-[var(--muted)]">{months[hover]!.label}</div>
                  {(["received", "installed"] as const).map((k) => (
                    <div key={k} className="flex items-center gap-2 text-[12.5px]">
                      <Swatch color={SERIES[k].color} />
                      <span className="flex-1 text-[var(--muted)]">{SERIES[k].label}</span>
                      <span className="num font-semibold text-[var(--ink)]">{n(months[hover]![k])}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <div className="w-8 shrink-0" />
            <div className="flex min-w-0 flex-1 gap-1 sm:gap-2">
              {months.map((m, i) => (
                <span key={m.key} className="min-w-0 flex-1 truncate text-center text-[10.5px] font-medium text-[var(--muted)]">
                  {i % showEvery === 0 ? m.label : ""}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-[var(--link)]">Show as table</summary>
        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[var(--muted)]">
              <th className="py-1 font-semibold">Month</th>
              <th className="py-1 text-right font-semibold">Received</th>
              <th className="py-1 text-right font-semibold">Installed</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className="border-t border-[var(--line-soft)]">
                <td className="py-1">{m.label}</td>
                <td className="num py-1 text-right">{n(m.received)}</td>
                <td className="num py-1 text-right">{n(m.installed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Installed | in stock as one proportional bar, with a 2px gap between the parts. */
export function StockBar({ installed, inStock }: { installed: number; inStock: number }) {
  const total = installed + inStock;
  if (total === 0) return <span className="block h-2.5 rounded-full bg-[var(--data-track)]" />;
  return (
    <span
      role="img"
      aria-label={`${installed} installed, ${inStock} in stock`}
      title={`${installed} installed · ${inStock} in stock`}
      className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-[var(--data-track)]"
    >
      {installed > 0 ? (
        <span className="block h-full" style={{ width: `${(installed / total) * 100}%`, backgroundColor: SERIES.installed.color }} />
      ) : null}
      {inStock > 0 ? (
        <span className="block h-full" style={{ width: `${(inStock / total) * 100}%`, backgroundColor: SERIES.inStock.color }} />
      ) : null}
    </span>
  );
}
