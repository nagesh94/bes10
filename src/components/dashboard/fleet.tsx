import type { ReactNode } from "react";

/**
 * The pieces the statistics board is built from.
 *
 * Deliberately few: one panel shape, one bar row, one figure. Everything on
 * the board is a quantity of hardware, so it is all set in the same way —
 * label left, figure right, fixed-width digits so a column of numbers lines
 * up and nothing jumps when a count changes.
 */

const SERIES = [
  "var(--data-1)",
  "var(--data-2)",
  "var(--data-3)",
  "var(--data-4)",
  "var(--data-5)",
  "var(--data-6)",
] as const;

export function seriesColor(index: number) {
  return index < SERIES.length ? SERIES[index]! : "var(--data-rest)";
}

const inr = new Intl.NumberFormat("en-IN");

export function n(value: number, decimals = 0) {
  return inr.format(Number(value.toFixed(decimals)));
}

export function Panel({
  title,
  note,
  children,
  raised = false,
  className = "",
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  raised?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] ${
        raised ? "shadow-[var(--shadow-panel)]" : "shadow-[var(--shadow-card)]"
      } ${className}`}
    >
      {title ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line-soft)] px-5 py-3.5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {note ? <p className="text-[12.5px] text-[var(--muted)]">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The one big figure. Gold is for energy, ink for everything else. */
export function Figure({
  value,
  unit,
  label,
  tone = "ink",
  size = "md",
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "ink" | "gold";
  size?: "md" | "lg";
}) {
  return (
    <div>
      <div
        className={`num font-extrabold ${
          size === "lg" ? "text-[clamp(2.5rem,8vw,3.75rem)] leading-[0.95]" : "text-[26px] leading-tight"
        } ${tone === "gold" ? "text-[var(--gold-text)]" : "text-[var(--ink)]"}`}
      >
        {value}
        {unit ? (
          <span
            className={`ml-1 font-bold text-[var(--muted)] ${
              size === "lg" ? "text-[0.34em]" : "text-[0.6em]"
            }`}
          >
            {unit}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[13px] font-medium text-[var(--muted)]">{label}</div>
    </div>
  );
}

/**
 * A distribution row. The bar sits under the label rather than beside it so
 * a long manufacturer name never squeezes the bar into nothing on a phone.
 */
export function BarRow({
  label,
  share,
  color,
  primary,
  secondary,
}: {
  label: string;
  share: number;
  color: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <li className="px-5 py-3">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{label}</span>
        <span className="num shrink-0 text-[13.5px] font-bold">{primary}</span>
        {secondary ? (
          <span className="num w-16 shrink-0 text-right text-[12.5px] text-[var(--muted)]">
            {secondary}
          </span>
        ) : null}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--data-track)]"
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(share * 100, 1.5)}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}

/** Label and value on one line, divided by a hairline. For plain counts. */
export function Line({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0">
      <span className="text-[13.5px] font-medium text-[var(--muted)]">{label}</span>
      <span className="flex items-baseline gap-2">
        {hint ? <span className="text-[12px] text-[var(--muted-soft)]">{hint}</span> : null}
        <span className="num text-[15px] font-bold">{value}</span>
      </span>
    </div>
  );
}

/**
 * Every module the company has put on a roof, one cell each, coloured by
 * who made it.
 *
 * The hero of the board is the array itself rather than a number with a
 * gradient behind it: it is the shape of the work, it answers "how much is
 * up there" and "whose glass is it" at the same time, and it grows as the
 * business does. Past a few hundred modules one cell starts to stand for
 * several, which the caption says plainly.
 */
export function ModuleArray({
  groups,
  total,
}: {
  groups: { label: string; modules: number }[];
  total: number;
}) {
  const MAX_CELLS = 192;
  const per = total > MAX_CELLS ? Math.ceil(total / MAX_CELLS) : 1;
  const cells: number[] = [];
  groups.forEach((g, i) => {
    const count = Math.max(Math.round(g.modules / per), 1);
    for (let c = 0; c < count; c += 1) cells.push(i);
  });

  // Roughly 2.2 : 1, the proportion of a real residential array.
  const cols = Math.min(Math.max(Math.ceil(Math.sqrt(cells.length * 2.2)), 4), 24);

  return (
    <div>
      <div
        className="grid w-fit max-w-full gap-[3px] rounded-[5px] border-[1.5px] border-[var(--line)] bg-[var(--surface-sunken)] p-[5px]"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          width: `${cols * 31}px`,
        }}
        role="img"
        aria-label={`${total} modules installed${
          per > 1 ? `, drawn at one cell per ${per} modules` : ""
        }`}
      >
        {cells.map((group, i) => (
          <span
            key={i}
            className="block aspect-[1/1.75] rounded-[2px]"
            style={{
              backgroundColor: seriesColor(group),
              backgroundImage:
                "linear-gradient(to bottom, rgb(255 255 255 / 0.16), transparent 42%), repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.22) 0 1px, transparent 1px 33%)",
            }}
          />
        ))}
      </div>
      {per > 1 ? (
        <p className="mt-2 text-[12px] text-[var(--muted-soft)]">One cell is {per} modules.</p>
      ) : null}
    </div>
  );
}
