import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

/**
 * Project codes look like BHIM-2026-0007.
 *
 * They are read aloud over the phone and written on physical files, so they
 * are short, sequential within the year, and never reused. The number comes
 * from a count inside the transaction rather than a global sequence, so the
 * series restarts cleanly each January.
 */
export async function nextProjectCode(tx: typeof Db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BHIM-${year}-`;

  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(sql`${projects.code} like ${prefix + "%"}`);

  const next = (row?.n ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
