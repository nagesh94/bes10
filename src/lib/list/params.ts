/**
 * Reading a list page's query string.
 *
 * The quotations and agreements lists keep their state in the URL rather
 * than in React: a filtered page can be bookmarked, sent to a colleague over
 * WhatsApp, and reloaded without losing where you were. It also means the
 * server renders exactly the rows being looked at.
 *
 * Everything here distrusts its input — these values arrive in a URL anyone
 * can type — so a nonsense page, a negative limit or an unknown status all
 * fall back to the default rather than reaching a query.
 */

export interface ListParams<Status extends string = string> {
  q: string;
  /** "" means every status. Typed to the column's own union by the caller. */
  status: Status | "";
  /** "attached" or "standalone" — the walk-in distinction, filterable. */
  project: "attached" | "standalone" | "";
  page: number;
  per: number;
  offset: number;
}

/** What the page-size control offers. 25 is the default, as asked. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PER_PAGE = 25;

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string {
  const value = raw[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * Generic over the status union so a page can hand the parsed value straight
 * to `eq(table.status, …)`: these columns are Postgres enums, and drizzle
 * types them as their own literal union rather than as a string.
 */
export async function readListParams<Status extends string>(
  searchParams: Promise<Raw>,
  allowedStatuses: readonly Status[],
): Promise<ListParams<Status>> {
  const raw = await searchParams;

  const status = one(raw, "status").toUpperCase() as Status;
  const project = one(raw, "project").toLowerCase();

  const perRaw = Number(one(raw, "per"));
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw)
    ? perRaw
    : DEFAULT_PER_PAGE;

  const pageRaw = Number(one(raw, "page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return {
    // Trimmed, and capped: a 4,000-character search box entry is not a
    // search, and it would reach the database as an ILIKE pattern.
    q: one(raw, "q").slice(0, 80),
    status: allowedStatuses.includes(status) ? status : "",
    project: project === "attached" || project === "standalone" ? project : "",
    page,
    per,
    offset: (page - 1) * per,
  };
}

/** True when the list is showing a subset, which changes what empty means. */
export function isFiltered(params: ListParams): boolean {
  return Boolean(params.q || params.status || params.project);
}

/**
 * The ILIKE pattern for a search term.
 *
 * `%` and `_` are escaped so a consumer called "100%" is searched for rather
 * than matching every row. Backslash is Postgres's default LIKE escape, so
 * no ESCAPE clause is needed alongside it.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
