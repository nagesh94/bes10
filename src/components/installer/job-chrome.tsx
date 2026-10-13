import Link from "next/link";

/**
 * The pieces the installer's screens are built from.
 *
 * Phone first throughout: one column, 48px tap targets, the title truncated
 * rather than wrapped into the content, and the primary action always within
 * thumb reach at the end of the card.
 */

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex h-11 items-center gap-1.5 pr-2 pl-1 text-[13.5px] font-semibold text-[var(--muted)] no-underline"
    >
      <span aria-hidden className="text-[16px] leading-none">‹</span>
      {label}
    </Link>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-[21px] leading-tight font-bold tracking-[-0.01em]">{title}</h1>
      {sub ? <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--muted)]">{sub}</p> : null}
    </div>
  );
}

export type TaskState = "done" | "part" | "todo";

const PILL: Record<TaskState, string> = {
  done: "border-[var(--green-border)] bg-[var(--green-soft)] text-[var(--green-text)]",
  part: "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber-text)]",
  todo: "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]",
};

export function StatePill({ state, children }: { state: TaskState; children: React.ReactNode }) {
  return (
    <span
      className={`ref inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11.5px] font-bold ${PILL[state]}`}
    >
      {state === "done" ? "✓ " : ""}
      {children}
    </span>
  );
}

/** A whole-card tap target — the only way into a form on the installer side. */
export function TaskCard({
  href,
  step,
  title,
  blurb,
  state,
  status,
}: {
  href: string;
  step: string;
  title: string;
  blurb: string;
  state: TaskState;
  status: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[var(--radius)] border bg-[var(--surface)] px-4 py-4 no-underline ${
        state === "done" ? "border-[var(--green-border)]" : "border-[var(--line)]"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="ref flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--navy-soft)] text-[12px] font-bold text-[var(--link)]">
          {step}
        </span>
        <h2 className="min-w-0 flex-1 text-[16px] font-bold text-[var(--ink)]">{title}</h2>
        <span aria-hidden className="shrink-0 text-[18px] leading-none text-[var(--muted-soft)]">›</span>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">{blurb}</p>
      <StatePill state={state}>{status}</StatePill>
    </Link>
  );
}

/** A stacked section on a form page. Padding is tighter than the desktop one. */
export function FieldSection({
  title,
  blurb,
  children,
}: {
  title?: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      {title ? <h2 className="mb-0.5 text-[16px] font-bold">{title}</h2> : null}
      {blurb ? <p className="mb-3.5 text-[13px] leading-relaxed text-[var(--muted)]">{blurb}</p> : null}
      {children}
    </section>
  );
}
