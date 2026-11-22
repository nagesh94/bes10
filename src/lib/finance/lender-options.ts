import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lenders } from "@/lib/db/schema";
import type { LenderOption } from "./lender-kinds";

/**
 * The active lenders, for the loan form's dropdown. A lender names no money,
 * so this needs no money check of its own; the form it feeds is admin-only.
 */
export async function loadLenderOptions(): Promise<LenderOption[]> {
  return db
    .select({ id: lenders.id, name: lenders.name, kind: lenders.kind })
    .from(lenders)
    .where(eq(lenders.active, true))
    .orderBy(asc(lenders.name));
}
