"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, documents, projects } from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { DOC_TYPES, isDocType, type DocType } from "@/lib/documents/types";
import { isRegenerableDocType } from "@/lib/documents/portal-pack";
import { regenerateProjectAgreement } from "@/app/actions/agreements";
import { generateDocument } from "@/app/actions/generate";
import { writeAudit } from "@/lib/admin/write-audit";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { PORTAL_MAX_KB, documentKey } from "@/lib/storage/client";
import { fileHref } from "@/lib/storage/file-url";
import {
  deleteDocumentObject,
  deleteTempObject,
  ensureBuckets,
  getTempObject,
  presignUpload,
  putDocument,
} from "@/lib/storage/operations";
import { buildVariants } from "@/lib/storage/variants";

export type PresignResult =
  | { ok: true; uploadUrl: string; tempKey: string }
  | { ok: false; error: string };

export async function requestUpload(
  projectId: string,
  docType: DocType,
  fileName: string,
  contentType: string,
): Promise<PresignResult> {
  const actor = await getActor();
  assertCan(actor, "document.upload");

  if (!isDocType(docType)) return { ok: false, error: "Unknown document type." };

  await ensureBuckets();

  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const tempKey = `incoming/${projectId}/${crypto.randomUUID()}-${safe}`;
  const uploadUrl = await presignUpload(tempKey, contentType);

  return { ok: true, uploadUrl, tempKey };
}

export type FinaliseResult =
  | {
      ok: true;
      documentId: string;
      portalKb: number | null;
      pageCount: number | null;
      overCap: boolean;
    }
  | { ok: false; error: string };

/**
 * Pulls the uploaded file out of the temp bucket, builds the three variants,
 * writes them to the documents bucket and records the row.
 */
export async function finaliseUpload(
  projectId: string,
  docType: DocType,
  tempKey: string,
  fileName: string,
): Promise<FinaliseResult> {
  const actor = await getActor();
  assertCan(actor, "document.upload");

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "That project no longer exists." };

  let source: { body: Buffer; contentType: string };
  try {
    source = await getTempObject(tempKey);
  } catch {
    return { ok: false, error: "The upload did not arrive. Try again." };
  }

  const variants = await buildVariants(source.body, source.contentType);

  const keyOriginal = documentKey(projectId, docType, "original", fileName);
  await putDocument(keyOriginal, variants.original.body, variants.original.contentType);

  let keyPortal: string | null = null;
  if (variants.portalSameAsOriginal) {
    // A PDF already under the cap: one object, two references. Storing it
    // twice would double the bill for no benefit.
    keyPortal = keyOriginal;
  } else if (variants.portal) {
    const ext = variants.portal.contentType === "application/pdf" ? "pdf" : "jpg";
    keyPortal = documentKey(projectId, docType, "portal", `${fileName}.${ext}`);
    await putDocument(keyPortal, variants.portal.body, variants.portal.contentType);
  }

  let keyThumb: string | null = null;
  if (variants.thumb) {
    keyThumb = documentKey(projectId, docType, "thumb", `${fileName}.jpg`);
    await putDocument(keyThumb, variants.thumb.body, variants.thumb.contentType);
  }

  await deleteTempObject(tempKey);

  const documentId = newId("doc");
  await db.insert(documents).values({
    id: documentId,
    projectId,
    docType,
    docClass: DOC_TYPES[docType].class,
    status: "VERIFIED",
    fileName,
    mimeType: variants.original.contentType,
    sizeBytes: variants.original.bytes,
    pageCount: variants.pageCount ?? null,
    s3KeyOriginal: keyOriginal,
    s3KeyPortal: keyPortal,
    s3KeyThumb: keyThumb,
    uploadedBy: actor.id,
  });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "document.upload",
    entityType: "document",
    entityId: documentId,
    projectId,
    after: {
      docType,
      fileName,
      originalBytes: variants.original.bytes,
      portalBytes: variants.portal?.bytes ?? null,
    },
  });

  const portalKb = variants.portal ? Math.round(variants.portal.bytes / 1024) : null;

  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath(`/projects/${projectId}/flags`);
  return {
    ok: true,
    documentId,
    portalKb,
    pageCount: variants.pageCount ?? null,
    overCap: Boolean(variants.portalOverCap),
  };
}

/**
 * The link to one variant, checked before it is handed out.
 *
 * The URL points at this app, not at storage — see `lib/storage/file-url`
 * for why, and note that the route behind it checks the permission again.
 * This check stays because it is what lets the page show "Not allowed" in
 * place of the row's buttons instead of opening a blank tab onto a 403.
 *
 * Opening an Aadhaar document is itself written to the audit log — the
 * architecture treats a read of that file as an event worth recording.
 */
export async function getDocumentUrl(
  documentId: string,
  variant: "original" | "portal" | "thumb" = "original",
  disposition: "inline" | "attachment" = "inline",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await getActor();
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc || doc.deletedAt) return { ok: false, error: "No such document." };

  if (!can(actor, "document.read")) return { ok: false, error: "Not allowed." };

  const key =
    variant === "portal"
      ? doc.s3KeyPortal
      : variant === "thumb"
        ? doc.s3KeyThumb
        : doc.s3KeyOriginal;

  if (!key) return { ok: false, error: "That variant does not exist for this file." };

  if (doc.docType === "AADHAAR") {
    await db.insert(auditLog).values({
      actorId: actor!.id,
      action: "document.read.aadhaar",
      entityType: "document",
      entityId: documentId,
      projectId: doc.projectId,
    });
  }

  return {
    ok: true,
    url: fileHref("document", documentId, {
      variant,
      download: disposition === "attachment",
    }),
  };
}

/**
 * Admin-only. The row and its audit trail are kept (`deletedBy`/`deletedAt`),
 * so "who deleted this and why" stays answerable after the file is gone —
 * only the stored object is actually removed. Every listing and gate that
 * reads `documents` filters `deletedAt IS NULL`, so a deleted row simply
 * stops appearing and stops counting.
 *
 * A quotation's filed PDF can't be deleted here — its lifecycle (status,
 * choosing, attaching) is the quotation page's job, not this generic action.
 */
export async function deleteDocument(
  documentId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "document.delete");

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc || doc.deletedAt) return { ok: false, error: "No such document." };

  if (doc.docType === "QUOTATION") {
    return {
      ok: false,
      error:
        "Quotations can't be deleted here. Mark it Declined or Expired, detach it, or delete the quotation itself, from the quotation page.",
    };
  }

  await db
    .update(documents)
    .set({ deletedBy: actor.id, deletedAt: new Date() })
    .where(eq(documents.id, documentId));

  for (const key of [doc.s3KeyOriginal, doc.s3KeyPortal, doc.s3KeyThumb]) {
    if (key) await deleteDocumentObject(key);
  }

  await writeAudit({
    actorId: actor.id,
    action: "document.delete",
    entityType: "document",
    entityId: documentId,
    projectId: doc.projectId,
    before: { docType: doc.docType, fileName: doc.fileName, docClass: doc.docClass },
    reason: reason?.trim() || null,
  });

  revalidatePath(`/projects/${doc.projectId}/documents`);
  revalidatePath(`/projects/${doc.projectId}`);
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Rebuilds an app-generated document from the project's current data,
 * dispatching to whichever action actually knows how to build that doc type.
 * `generateDocument` already replaces the old row and object once the new
 * one is filed, and records `document.generate` in the audit log — this
 * only routes to it and stamps who asked for the rebuild. AGREEMENT goes to
 * the agreement maker instead, which rebuilds the project's filed agreement
 * from what the parties agreed rather than from the payment plan.
 */
export async function regenerateGeneratedDocument(
  projectId: string,
  docType: string,
): Promise<{ ok: true; documentId: string; fileName: string } | { ok: false; error: string }> {
  if (!isRegenerableDocType(docType)) {
    return { ok: false, error: "This document can't be regenerated here." };
  }

  const result =
    docType === "AGREEMENT"
      ? await regenerateProjectAgreement(projectId)
      : await generateDocument(projectId, docType);

  if (result.ok) {
    const actor = await getActor();
    await db
      .update(documents)
      .set({ lastModifiedBy: actor!.id, lastModifiedAt: new Date() })
      .where(eq(documents.id, result.documentId));
  }

  return result;
}
