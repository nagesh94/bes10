/**
 * A deep link out to a government portal.
 *
 * The URL comes from master data, never from code, so another DISCOM zone is
 * an admin edit rather than a deploy.
 */
export function PortalLink({
  href,
  title,
  note,
}: {
  href: string | null;
  title: string;
  note?: string;
}) {
  if (!href) {
    return (
      <p className="mb-5 rounded-[9px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-[var(--muted)]">
        No portal URL is set for this DISCOM yet — an admin can add it under Master data.
      </p>
    );
  }

  let host = href;
  try {
    host = new URL(href).host;
  } catch {
    // Leave the raw string if it is not a parseable URL.
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-5 flex items-center gap-3 rounded-[9px] bg-[var(--navy)] px-4 py-3.5 text-[var(--navy-ink)] no-underline"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="ref mt-0.5 block text-[11.5px] opacity-75">
          {host} · {note ?? "opens in a new tab"}
        </span>
      </span>
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
      </svg>
    </a>
  );
}
