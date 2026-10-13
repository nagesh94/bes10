"use server";

import { and, eq, max, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/admin/write-audit";
import { db } from "@/lib/db";
import { documentTemplates } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { ensureBuckets, putDocument } from "@/lib/storage/operations";
import { uploadTemplateSchema } from "@/lib/validation/admin";

export type TemplateActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const MAX_BYTES = 15 * 1024 * 1024;

function fieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const raw = error.flatten().fieldErrors;
  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(raw)) {
    if (messages?.length) out[key] = messages;
  }
  return out;
}

function refresh() {
  revalidatePath("/admin/master");
  revalidatePath("/admin/templates");
  revalidatePath("/admin/audit");
}

/**
 * Stores a new template version and retires the one it replaces.
 *
 * Old projects keep the version they were generated with, so a reworded
 * agreement never rewrites a file that has already gone to a bank.
 */
export async function uploadTemplate(formData: FormData): Promise<TemplateActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.templates");

  const parsed = uploadTemplateSchema.safeParse({
    name: formData.get("name"),
    docType: formData.get("docType"),
    engine: formData.get("engine"),
    onLetterhead: formData.get("onLetterhead") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose the Word or PDF file.", fieldErrors: { file: ["A file is required"] } };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That file is over 15 MB.", fieldErrors: { file: ["Over 15 MB"] } };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (input.engine === "DOCX" && ext !== "docx") {
    return { ok: false, error: "A DOCX template needs a .docx file.", fieldErrors: { file: ["Expected a .docx file"] } };
  }
  if (input.engine !== "DOCX" && ext !== "pdf") {
    return { ok: false, error: "That engine fills a PDF.", fieldErrors: { file: ["Expected a .pdf file"] } };
  }

  const [latest] = await db
    .select({ version: max(documentTemplates.version) })
    .from(documentTemplates)
    .where(eq(documentTemplates.docType, input.docType));
  const version = (latest?.version ?? 0) + 1;
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `templates/${input.docType}/v${version}/${safeName}`;

  const [created] = await db
    .insert(documentTemplates)
    .values({
      name: input.name,
      docType: input.docType,
      version,
      engine: input.engine,
      onLetterhead: input.onLetterhead,
      s3Key: key,
      active: true,
    })
    .returning({ id: documentTemplates.id });

  if (!created) return { ok: false, error: "The template row could not be saved." };

  try {
    await ensureBuckets();
    await putDocument(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  } catch {
    await db.delete(documentTemplates).where(eq(documentTemplates.id, created.id));
    return { ok: false, error: "The file could not be stored. Check that storage is running." };
  }

  await db
    .update(documentTemplates)
    .set({ active: false })
    .where(
      and(
        eq(documentTemplates.docType, input.docType),
        eq(documentTemplates.active, true),
        ne(documentTemplates.id, created.id),
      ),
    );

  await writeAudit({
    actorId: actor.id,
    action: "template.upload",
    entityType: "template",
    entityId: String(created.id),
    after: { name: input.name, docType: input.docType, version, engine: input.engine },
  });
  refresh();
  return { ok: true };
}

export async function activateTemplate(id: number): Promise<TemplateActionResult> {
  const actor = await getActor();
  assertCan(actor, "admin.templates");

  const [current] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, id)).limit(1);
  if (!current) return { ok: false, error: "That template no longer exists." };
  if (current.active) return { ok: true };

  await db
    .update(documentTemplates)
    .set({ active: false })
    .where(and(eq(documentTemplates.docType, current.docType), eq(documentTemplates.active, true)));
  await db.update(documentTemplates).set({ active: true }).where(eq(documentTemplates.id, id));

  await writeAudit({
    actorId: actor.id,
    action: "template.activate",
    entityType: "template",
    entityId: String(id),
    after: { name: current.name, docType: current.docType, version: current.version },
  });
  refresh();
  return { ok: true };
}
