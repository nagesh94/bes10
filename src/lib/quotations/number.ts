import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";

/**
 * Quotation numbers.
 *
 *   BHIM100000, BHIM100001, BHIM100002, …
 *
 * One series for the whole company, never restarted — unlike project codes,
 * which begin again each January. A quotation number is quoted back over the
 * phone months later and written on the customer's copy, so a number that
 * came round twice would be worse than a gap.
 *
 * The allocation is a single statement. `INSERT … ON CONFLICT DO UPDATE`
 * takes a row lock for its duration, so two people saving at the same instant
 * queue behind each other and get different numbers. The obvious
 * `max(number) + 1` does not: both would read the same maximum.
 *
 * The first call seeds the row at the start of the series and hands that out,
 * so there is nothing to remember to insert at deploy time.
 */

export const QUOTATION_PREFIX = "BHIM";
export const SERIES_START = 100000;
const COUNTER_ID = "default";

export function formatQuotationNumber(value: number): string {
  return `${QUOTATION_PREFIX}${value}`;
}

export async function nextQuotationNumber(tx: typeof Db): Promise<string> {
  const result = await tx.execute(sql`
    insert into quotation_counters (id, last_number)
    values (${COUNTER_ID}, ${SERIES_START})
    on conflict (id) do update
      set last_number = quotation_counters.last_number + 1
    returning last_number
  `);

  // postgres-js hands back a row list; drizzle has wrapped `execute` in both
  // shapes across versions, so read it defensively rather than assume one.
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  const value = Number((rows[0] as { last_number?: number } | undefined)?.last_number);

  if (!Number.isFinite(value)) {
    throw new Error("Could not allocate a quotation number.");
  }
  return formatQuotationNumber(value);
}

/** What the next quotation will be called, without spending the number. */
export async function peekQuotationNumber(tx: typeof Db): Promise<string> {
  const result = await tx.execute(
    sql`select last_number from quotation_counters where id = ${COUNTER_ID}`,
  );
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  const last = Number((rows[0] as { last_number?: number } | undefined)?.last_number);
  return formatQuotationNumber(Number.isFinite(last) ? last + 1 : SERIES_START);
}
