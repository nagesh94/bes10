import Link from "next/link";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The flags chip — a link to a project's flags, carrying which ones are open.
 *
 * The chip is the link; the card over it is a preview, not a menu. Hover and
 * keyboard focus both reveal it, and it is CSS-only so it costs no
 * JavaScript — on a phone, where there is no hover, tapping simply goes to
 * the page, which is the same answer.
 *
 * Shared between the project header and the project list so the one question
 * — "what is blocking this one?" — looks and reads the same whether you are
 * inside a job or scanning five hundred of them.
 */
export function FlagsChip({
  projectId,
  openFlags,
  compact = false,
}: {
  projectId: string;
  openFlags: Array<{ type: string; status: string }>;
  /** The list variant: count only, no word, and the browser's own tooltip. */
  compact?: boolean;
}) {
  const t = useTranslations("projects.c");
  const tl = useTranslations("labels");
  const flagLabel = (type: string) => (tl.has(`flags.${type}`) ? tl(`flags.${type}`) : type);
  const count = openFlags.length;

  // A server component, so no useId — the project id is already unique on the
  // page and makes the association readable in the DOM.
  const summaryId = `flag-summary-${projectId}`;

  /**
   * The same sentence the card says, as one line.
   *
   * In the list the chip sits inside a table that scrolls sideways, and a
   * scroll container clips on both axes — a card hanging off the last row
   * would be cut in half by it. The browser's own tooltip is drawn above the
   * page and nothing can clip it, so the compact chip uses that instead.
   */
  const summaryText =
    count === 0
      ? t("noOpenFlags")
      : `${t("openFlags", { count })}: ${openFlags
          .map((f) => `${flagLabel(f.type)}${f.status === "IN_PROGRESS" ? ` (${tl("inProgress")})` : ""}`)
          .join(", ")}`;

  const chip = compact
    ? "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[12px] font-semibold text-[var(--muted)] no-underline hover:bg-[var(--surface-sunken)]"
    : "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12.5px] font-semibold text-[var(--ink)] no-underline hover:bg-[var(--surface-sunken)]";

  return (
    <span className="group relative">
      <Link
        href={`/projects/${projectId}/flags`}
        aria-describedby={!compact && count > 0 ? summaryId : undefined}
        aria-label={compact ? `${t("flags")} — ${summaryText}` : undefined}
        title={compact ? summaryText : undefined}
        className={
          count > 0
            ? `${chip} border-[var(--amber-border)] bg-[var(--amber-surface)] text-[var(--amber-text)]`
            : chip
        }
      >
        <Flag size={compact ? 14 : 15} strokeWidth={2} aria-hidden />
        {compact ? null : t("flags")}
        <span
          className={`ref rounded-full px-1.5 text-[10.5px] font-bold ${
            count > 0
              ? "bg-[var(--amber-soft)] text-[var(--amber-text)]"
              : "bg-[var(--green-soft)] text-[var(--green-text)]"
          }`}
        >
          {count > 0 ? count : t("clear")}
        </span>
      </Link>

      {count > 0 && !compact ? (
        <span
          id={summaryId}
          role="tooltip"
          className="pointer-events-none invisible absolute top-full left-0 z-30 mt-1.5 w-max max-w-[17rem] rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-left opacity-0 shadow-[var(--shadow-panel)] transition-opacity duration-100 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        >
          <span className="mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase">
            {t("openFlags", { count })}
          </span>
          {openFlags.map((f) => (
            <span key={f.type} className="mt-1 flex items-center gap-2 first:mt-0">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber-text)]" />
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                {flagLabel(f.type)}
              </span>
              {f.status === "IN_PROGRESS" ? (
                <span className="text-[11.5px] text-[var(--muted)]">{tl("inProgress")}</span>
              ) : null}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
