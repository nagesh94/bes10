import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTemplates } from "@/lib/db/schema";
import type { TemplateView } from "@/components/admin/template-list";

function fieldCount(fieldMap: string | null): number | null {
  if (!fieldMap) return null;
  try {
    const parsed = JSON.parse(fieldMap) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
  } catch {
    return null;
  }
  return null;
}

export async function loadTemplates(): Promise<TemplateView[]> {
  const rows = await db
    .select()
    .from(documentTemplates)
    .orderBy(desc(documentTemplates.uploadedAt), desc(documentTemplates.version));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    docType: row.docType,
    version: row.version,
    engine: row.engine,
    active: row.active,
    onLetterhead: row.onLetterhead,
    uploadedAt: row.uploadedAt,
    fieldCount: fieldCount(row.fieldMap),
  }));
}
