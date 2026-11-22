"use client";

import { useState } from "react";

/**
 * The finance charts.
 *
 * Plain HTML and SVG — the app has no chart library, and two charts do not
 * justify one. Both follow the same rules as the hardware board: colour
 * follows the entity (a payment mode keeps its colour whatever the filter),
 * the numbers are set in ink rather than in the series colour, and every
 * mark answers a hover with its exact figure.
 */

export interface Series {
  key: string;
  label: string;
  color: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

/** A round axis maximum: 1, 2 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= value) return step * pow;
  return 10 * pow;
}

export function Legend({ series }: { series: readonly Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
          <span className="block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Collections per month, stacked by how the money arrived.
 *
 * One axis, rupees. A month with nothing still gets its slot so a gap in
 * collections reads as a gap rather than being closed up.
 */
export function MonthlyBars({
  months,
  series,
}: {
  months: Array<{ key: string; label: string; values: Record<string, number>; count: number }>;
  series: readonly Series[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = months.map((m) => Object.values(m.values).reduce((s, v) => s + v, 0));
  const max = niceMax(Math.max(...totals, 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const present = series.filter((s) => months.some((m) => (m.values[s.key] ?? 0) > 0));
  const showEvery = months.length > 18 ? 3 : months.length > 12 ? 2 : 1;

  return (
    <div>
      <div className="mb-4">
        <Legend series={present.length ? present : series} />
      </div>
      <div className="relative flex h-[260px] gap-2 select-none">
        {/* Y axis labels */}
        <div className="relative w-10 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="num absolute right-0 -translate-y-1/2 text-[11px] text-[var(--muted-soft)]"
              style={{ bottom: `${(t / max) * 100}%` }}
            >
              {compact(t)}
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

          <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
            {months.map((m, i) => {
              const total = totals[i] ?? 0;
              return (
                <div
                  key={m.key}
                  className="relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${m.label}: ${inr(total)} collected`}
                >
                  {hover === i ? (
                    <span className="absolute inset-x-[-2px] inset-y-0 rounded-md bg-[var(--data-track)] opacity-60" />
                  ) : null}
                  <div
                    className="relative mx-auto flex w-full max-w-[38px] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {series.map((s) => {
                      const v = m.values[s.key] ?? 0;
                      if (v <= 0) return null;
                      return (
                        <span
                          key={s.key}
                          className="block w-full shrink-0"
                          style={{ height: `${(v / total) * 100}%`, backgroundColor: s.color, minHeight: 2 }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {hover !== null && months[hover] ? (
            <Tooltip
              left={`${((hover + 0.5) / months.length) * 100}%`}
              flip={hover > months.length / 2}
              title={months[hover]!.label}
              total={inr(totals[hover] ?? 0)}
              sub={`${months[hover]!.count} payment${months[hover]!.count === 1 ? "" : "s"}`}
              lines={series
                .filter((s) => (months[hover]!.values[s.key] ?? 0) > 0)
                .map((s) => ({ color: s.color, label: s.label, value: inr(months[hover]!.values[s.key]!) }))}
            />
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="w-10 shrink-0" />
        <div className="flex min-w-0 flex-1 gap-[3px] sm:gap-1.5">
          {months.map((m, i) => (
            <span
              key={m.key}
              className="min-w-0 flex-1 truncate text-center text-[10.5px] font-medium text-[var(--muted)]"
            >
              {i % showEvery === 0 ? m.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tooltip({
  left,
  flip,
  title,
  total,
  sub,
  lines,
}: {
  left: string;
  flip: boolean;
  title: string;
  total: string;
  sub?: string;
  lines: Array<{ color: string; label: string; value: string }>;
}) {
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 w-56 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 shadow-[var(--shadow-float)]"
      style={{ left, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--muted)]">{title}</span>
        {sub ? <span className="text-[11px] text-[var(--muted-soft)]">{sub}</span> : null}
      </div>
      <div className="num mt-0.5 text-[17px] font-extrabold">{total}</div>
      {lines.length ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--line-soft)] pt-2">
          {lines.map((l) => (
            <li key={l.label} className="flex items-center gap-2 text-[12px]">
              <span className="block h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: l.color }} />
              <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{l.label}</span>
              <span className="num font-semibold">{l.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * A ring for a part-to-whole of a handful of categories, with the legend
 * beside it doubling as the table: every slice is named and has its figure,
 * so nothing depends on telling two colours apart.
 */
export function Donut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ key: string; label: string; color: string; value: number; hint?: string }>;
  centerLabel: string;
  centerValue: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2.5 : 0;
  let offset = 0;
  const active = slices.find((s) => s.key === hover);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative mx-auto h-[156px] w-[156px] shrink-0">
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="64" cy="64" r={R} fill="none" stroke="var(--data-track)" strokeWidth="14" />
          {total > 0
            ? slices.map((s) => {
                if (s.value <= 0) return null;
                const len = (s.value / total) * C;
                const dash = Math.max(len - gap, 0.5);
                const el = (
                  <circle
                    key={s.key}
                    cx="64"
                    cy="64"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={hover === s.key ? 18 : 14}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-offset}
                    opacity={hover && hover !== s.key ? 0.35 : 1}
                    className="transition-[stroke-width,opacity] duration-150"
                    onMouseEnter={() => setHover(s.key)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="num text-[18px] leading-tight font-extrabold">
              {active ? inr(active.value) : centerValue}
            </div>
            <div className="mt-0.5 max-w-[96px] text-[11px] leading-tight font-medium text-[var(--muted)]">
              {active ? active.label : centerLabel}
            </div>
          </div>
        </div>
      </div>

      <ul className="min-w-52 flex-1 space-y-0.5">
        {slices.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${hover === s.key ? "bg-[var(--surface-2)]" : ""}`}
          >
            <span className="block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{s.label}</span>
            {s.hint ? <span className="text-[11.5px] text-[var(--muted)]">{s.hint}</span> : null}
            <span className="num w-20 text-right text-[13px] font-bold">{inr(s.value)}</span>
            <span className="num w-10 text-right text-[12px] text-[var(--muted)]">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
