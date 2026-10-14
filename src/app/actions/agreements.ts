"use server";

import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  agreementMilestones,
  agreements,
  auditLog,
  companyBranches,
  contacts,
  documents,
  projects,
} from "@/lib/db/schema";
import { emptyAgreement } from "@/lib/agreements/form-values";
import { prefillFromProject } from "@/lib/agreements/prefill";
import { buildAgreementDocx } from "@/lib/documents/agreement";
import { writeAudit } from "@/lib/admin/write-audit";
import { newId } from "@/lib/projects/code";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { agreementKey } from "@/lib/storage/client";
import { fileHref } from "@/lib/storage/file-url";
import { deleteDocumentObject, ensureBuckets, putDocument } from "@/lib/storage/operations";
import {
  agreementLinkSchema,
  agreementPrimarySchema,
  agreementSchema,
  agreementStatusSchema,
  type AgreementInput,
} from "@/lib/validation/agreement";

/**
 * The agreement maker.
 *
 * Built to the same pattern as `quotations.ts`, and the resemblance is the
 * point: the office learned one flow for producing a document and should
 * not have to learn a second.
 *
 * Two differences are worth knowing before changing anything.
 *
 * There is **no number**. The model agreement carries none on the paper, so
 * an agreement is identified by its consumer and execution date.
 *
 * The cost is **typed on the form**, not read from the payment plan. It
 * used to be read from the plan, which meant the agreement could not be
 * produced at all until an admin had locked one — the office could not hand
 * a draft to a customer sitting in the room. The form is prefilled from the
 * locked plan when there is one, and from the chosen quotation when there
 * is not (see `lib/agreements/prefill.ts`), but what prints is what was
 * typed, because the figure in clause 19.1 is agreed in conversation.
 *
 * Everything that prints is copied onto the row at save time — the parties,
 * the vendor's registered office, the cost and the instalments. Rebuilding
 * a two-year-old agreement after the company has moved office must produce
 * the old office's address, because that is what was signed.
 */

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type AgreementResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function fieldErrorsOf(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Renders the .docx, stores it, and files it against the project when this
 * is the project's primary agreement.
 *
 * Called on create and on every edit. A render failure must not lose the
 * agreement — the row is already written by this point — so the caller
 * reports it as a warning and the agreement sits there with no file, ready
 * to be built again.
 */
async function renderAndStore(
  agreementId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db.select().from(agreements).where(live(agreementId)).limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };

  const milestones = await db
    .select()
    .from(agreementMilestones)
    .where(eq(agreementMilestones.agreementId, agreementId))
    .orderBy(asc(agreementMilestones.sortOrder));

  const totalValue = Number(row.totalValue);

  let docx: Buffer;
  try {
    docx = await buildAgreementDocx({
      // A `date` column comes back as "2026-06-15"; parsed as local midnight
      // so the printed day never slips backwards in IST.
      executionDate: new Date(`${row.executionDate}T00:00:00`),
      consumer: {
        title: row.consumerTitle ?? "",
        name: row.consumerName,
        address: row.consumerAddress,
      },
      vendor: { name: row.vendorName, address: row.vendorAddress },
      totalValue,
      schedule: milestones.map((m) => {
        const amount = Number(m.amount);
        return {
          label: m.label,
          amount,
          percent: totalValue > 0 ? Math.round((amount / totalValue) * 100) : null,
        };
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The agreement could not be built.",
    };
  }

  const fileName = `Agreement-${row.consumerName.replace(/[^A-Za-z0-9]+/g, "-")}-${row.executionDate}.docx`;
  const key = agreementKey(row.id, fileName);

  await ensureBuckets();
  await putDocument(key, docx, DOCX_MIME);

  const previousKey = row.s3Key;

  await db
    .update(agreements)
    .set({
      s3Key: key,
      fileName,
      sizeBytes: docx.byteLength,
      docxGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agreements.id, agreementId));

  await syncFiledDocument(agreementId);

  // The old object is dropped only once the new one is filed, so a failure
  // half way through leaves the agreement with a file rather than none.
  if (previousKey && previousKey !== key) await deleteDocumentObject(previousKey);

  return { ok: true };
}

/**
 * Keeps the project's filed `AGREEMENT` document in step with this one.
 *
 * The same job `syncFiledDocument` does for quotations, and it matters for
 * the same reason: the stage 2 gate counts one `AGREEMENT` document and the
 * bank loan pack prints one, so whichever agreement is marked primary is
 * the one that must be filed — not whichever was saved last.
 *
 * It touches only the row this agreement filed, tracked by
 * `agreements.document_id`. An agreement someone uploaded by hand against
 * the same project is a different document and is left alone, which is what
 * lets the Stage 2 upload slot go on being the fallback for one drawn up by
 * a lawyer outside the app.
 */
async function syncFiledDocument(agreementId: string): Promise<void> {
  const [row] = await db
    .select({
      projectId: agreements.projectId,
      documentId: agreements.documentId,
      isPrimary: agreements.isPrimary,
      status: agreements.status,
      s3Key: agreements.s3Key,
      fileName: agreements.fileName,
      sizeBytes: agreements.sizeBytes,
    })
    .from(agreements)
    .where(eq(agreements.id, agreementId))
    .limit(1);
  if (!row) return;

  const shouldFile =
    Boolean(row.projectId && row.isPrimary && row.s3Key) && row.status !== "CANCELLED";

  if (!shouldFile) {
    if (row.documentId) {
      await db.delete(documents).where(eq(documents.id, row.documentId));
      await db.update(agreements).set({ documentId: null }).where(eq(agreements.id, agreementId));
    }
    return;
  }

  const values = {
    projectId: row.projectId!,
    docType: "AGREEMENT",
    docClass: "GENERATED" as const,
    status: "GENERATED" as const,
    fileName: row.fileName,
    mimeType: DOCX_MIME,
    sizeBytes: row.sizeBytes,
    s3KeyOriginal: row.s3Key,
    generatedAt: new Date(),
  };

  let documentId = row.documentId;

  if (documentId) {
    await db.update(documents).set(values).where(eq(documents.id, documentId));
  } else {
    documentId = newId("doc");
    await db.insert(documents).values({ id: documentId, ...values });
    await db.update(agreements).set({ documentId }).where(eq(agreements.id, agreementId));
  }

  // Any other machine-generated agreement on this project is a stale
  // duplicate: either one left by the old stage-2 generator, which replaced
  // whatever was filed before, or one filed by an agreement that has since
  // been stood down. Collected rows — an agreement a lawyer drew up and
  // someone uploaded — are a different document and are left alone.
  const stale = (
    await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.projectId, values.projectId),
          eq(documents.docClass, "GENERATED"),
          ne(documents.id, documentId),
          isNull(documents.deletedAt),
        ),
      )
  ).filter((d) => d.docType === "AGREEMENT");

  for (const old of stale) {
    await db.delete(documents).where(eq(documents.id, old.id));
    for (const key of [old.s3KeyOriginal, old.s3KeyPortal, old.s3KeyThumb]) {
      // Never the object this agreement itself points at — another
      // agreement row filed the same file before being stood down.
      if (key && key !== row.s3Key) await deleteDocumentObject(key);
    }
  }
}

/** Whether a project already has a filed agreement, ignoring one of them. */
async function hasPrimary(projectId: string, exceptId?: string): Promise<boolean> {
  const where = exceptId
    ? and(
        eq(agreements.projectId, projectId),
        eq(agreements.isPrimary, true),
        ne(agreements.id, exceptId),
      )
    : and(eq(agreements.projectId, projectId), eq(agreements.isPrimary, true));

  const rows = await db.select({ id: agreements.id }).from(agreements).where(where).limit(1);
  return rows.length > 0;
}

async function writeMilestones(agreementId: string, input: AgreementInput): Promise<void> {
  await db.delete(agreementMilestones).where(eq(agreementMilestones.agreementId, agreementId));
  await db.insert(agreementMilestones).values(
    input.milestones.map((m, index) => ({
      agreementId,
      sortOrder: index,
      label: m.label,
      amount: String(m.amount),
    })),
  );
}

/**
 * One agreement, as long as it has not been deleted.
 *
 * The twin of `live` in `quotations.ts`, and for the same reason: deleting
 * leaves the row behind, so a lookup by id has to say so.
 */
function live(id: string) {
  return and(eq(agreements.id, id), isNull(agreements.deletedAt));
}

function revalidate(projectId: string | null | undefined): void {
  revalidatePath("/agreements");
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/stage-2`);
    revalidatePath(`/projects/${projectId}/documents`);
    revalidatePath("/documents");
  }
}

export async function createAgreement(raw: AgreementInput): Promise<AgreementResult> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const parsed = agreementSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const input = parsed.data;

  const [branch] = await db
    .select()
    .from(companyBranches)
    .where(eq(companyBranches.isDefault, true))
    .limit(1);
  if (!branch) {
    return { ok: false, error: "No company branch is set up. Add one under Admin first." };
  }

  if (input.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project) return { ok: false, error: "That project no longer exists." };
  }

  const id = newId("agr");

  // The first agreement on a project is the one that is filed; a later one
  // joins as a draft, because which of two is the real one is a decision
  // only a person makes.
  const primary = input.projectId ? !(await hasPrimary(input.projectId)) : false;

  await db.insert(agreements).values({
    id,
    projectId: input.projectId || null,
    isPrimary: primary,
    status: "DRAFT",
    executionDate: input.executionDate,
    consumerTitle: input.consumerTitle || null,
    consumerName: input.consumerName,
    consumerAddress: input.consumerAddress,
    branchId: branch.id,
    vendorName: branch.companyName,
    vendorAddress: `${branch.addressLine}, ${branch.city} ${branch.pinCode}`.trim(),
    totalValue: String(input.totalValue),
    valueSource: input.valueSource || "typed",
    createdBy: actor.id,
  });

  await writeMilestones(id, input);

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.create",
    entityType: "agreement",
    entityId: id,
    projectId: input.projectId || null,
    after: {
      consumer: input.consumerName,
      executionDate: input.executionDate,
      totalValue: input.totalValue,
      valueSource: input.valueSource || "typed",
      instalments: input.milestones.length,
    },
  });

  const rendered = await renderAndStore(id);
  revalidate(input.projectId);

  if (!rendered.ok) {
    return {
      ok: false,
      error: `The agreement was saved, but the file could not be built: ${rendered.error}`,
    };
  }
  return { ok: true, id };
}

export async function updateAgreement(id: string, raw: AgreementInput): Promise<AgreementResult> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const parsed = agreementSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  const input = parsed.data;

  const [existing] = await db.select().from(agreements).where(live(id)).limit(1);
  if (!existing) return { ok: false, error: "That agreement no longer exists." };

  // The letterhead is deliberately not re-snapshotted on an edit. The second
  // party's registered office is the one the draft was written against, and
  // a branch that has since moved must not silently rewrite it.
  await db
    .update(agreements)
    .set({
      executionDate: input.executionDate,
      consumerTitle: input.consumerTitle || null,
      consumerName: input.consumerName,
      consumerAddress: input.consumerAddress,
      totalValue: String(input.totalValue),
      valueSource: input.valueSource || existing.valueSource || "typed",
      updatedAt: new Date(),
    })
    .where(eq(agreements.id, id));

  await writeMilestones(id, input);

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.update",
    entityType: "agreement",
    entityId: id,
    projectId: existing.projectId,
    before: {
      consumer: existing.consumerName,
      executionDate: existing.executionDate,
      totalValue: Number(existing.totalValue),
    },
    after: {
      consumer: input.consumerName,
      executionDate: input.executionDate,
      totalValue: input.totalValue,
      instalments: input.milestones.length,
    },
  });

  const rendered = await renderAndStore(id);
  revalidate(existing.projectId);

  if (!rendered.ok) {
    return {
      ok: false,
      error: `The changes were saved, but the file could not be rebuilt: ${rendered.error}`,
    };
  }
  return { ok: true, id };
}

/**
 * Rebuild the .docx from what is already saved.
 *
 * For after a lawyer asks for a fresh copy, or the clause text in
 * `lib/documents/agreement-text.ts` is corrected. Nothing the parties
 * agreed changes.
 */
export async function regenerateAgreementDocx(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const [row] = await db
    .select({ projectId: agreements.projectId, consumerName: agreements.consumerName })
    .from(agreements)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };

  const rendered = await renderAndStore(id);
  if (!rendered.ok) return rendered;

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.regenerate",
    entityType: "agreement",
    entityId: id,
    projectId: row.projectId,
    after: { consumer: row.consumerName },
  });

  revalidate(row.projectId);
  revalidatePath(`/agreements/${id}`);
  return { ok: true };
}

export async function setAgreementStatus(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const parsed = agreementStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not a status." };
  const { id, status } = parsed.data;

  const [row] = await db
    .select({ projectId: agreements.projectId, status: agreements.status })
    .from(agreements)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };

  await db.update(agreements).set({ status, updatedAt: new Date() }).where(eq(agreements.id, id));

  // A cancelled agreement stops being the project's filed one; reviving one
  // that is still marked primary files it again.
  await syncFiledDocument(id);

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.status",
    entityType: "agreement",
    entityId: id,
    projectId: row.projectId,
    before: { status: row.status },
    after: { status },
  });

  revalidate(row.projectId);
  revalidatePath(`/agreements/${id}`);
  return { ok: true };
}

/**
 * Make this the project's filed agreement.
 *
 * The previous one is stood down in the same transaction: the partial
 * unique index refuses two primary agreements on one project, and that
 * index is the thing actually guaranteeing one agreement reaches the bank
 * file. Nothing is deleted — the other draft is the record of what else was
 * drawn up, and the office does switch back.
 */
export async function makeAgreementPrimary(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const parsed = agreementPrimarySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not an agreement." };
  const { id } = parsed.data;

  const [row] = await db
    .select({
      projectId: agreements.projectId,
      isPrimary: agreements.isPrimary,
      status: agreements.status,
    })
    .from(agreements)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };
  if (!row.projectId) {
    return { ok: false, error: "Attach this agreement to a project before filing it." };
  }
  if (row.isPrimary) return { ok: true };
  if (row.status === "CANCELLED") {
    return { ok: false, error: "A cancelled agreement cannot be the project's agreement." };
  }

  const projectId = row.projectId;

  const standDown = await db
    .select({ id: agreements.id })
    .from(agreements)
    .where(and(eq(agreements.projectId, projectId), eq(agreements.isPrimary, true)));

  await db.transaction(async (tx) => {
    for (const other of standDown) {
      await tx.update(agreements).set({ isPrimary: false }).where(eq(agreements.id, other.id));
    }
    await tx.update(agreements).set({ isPrimary: true }).where(eq(agreements.id, id));
  });

  // Un-file the ones stood down, then file this one.
  for (const other of standDown) await syncFiledDocument(other.id);
  await syncFiledDocument(id);

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.primary",
    entityType: "agreement",
    entityId: id,
    projectId,
    before: { stoodDown: standDown.map((a) => a.id) },
    after: { primary: id },
  });

  revalidate(projectId);
  revalidatePath(`/agreements/${id}`);
  return { ok: true };
}

/**
 * Attach an agreement to a project, move it to another, or take it off one.
 *
 * The other half of drawing one up at the counter: a walk-in is given a
 * draft before there is anything to attach it to, and when they say yes the
 * draft joins the new project rather than being retyped. Nothing the
 * parties read changes — the file and the snapshot stay exactly as they
 * were. An empty `projectId` detaches.
 */
export async function linkAgreementToProject(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const parsed = agreementLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That is not a project." };
  const { id, projectId } = parsed.data;

  const [row] = await db
    .select({
      projectId: agreements.projectId,
      documentId: agreements.documentId,
      status: agreements.status,
    })
    .from(agreements)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };

  const target = projectId.trim();
  if (target) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, target))
      .limit(1);
    if (!project) return { ok: false, error: "That project no longer exists." };
  }

  const wasOn = row.projectId;
  if (wasOn === (target || null)) return { ok: true };

  // Moving or detaching always takes the filed copy off the old project
  // first — only the row this agreement filed, never one someone uploaded
  // by hand against the same project.
  if (row.documentId) {
    await db.delete(documents).where(eq(documents.id, row.documentId));
  }

  // The first agreement on the new project becomes its filed one; a later
  // one joins as a draft.
  const primary = target
    ? row.status !== "CANCELLED" && !(await hasPrimary(target, id))
    : false;

  await db
    .update(agreements)
    .set({
      projectId: target || null,
      isPrimary: primary,
      documentId: null,
      updatedAt: new Date(),
    })
    .where(eq(agreements.id, id));

  await syncFiledDocument(id);

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.link",
    entityType: "agreement",
    entityId: id,
    projectId: target || wasOn,
    before: { projectId: wasOn },
    after: { projectId: target || null, primary },
  });

  revalidate(wasOn);
  revalidate(target || null);
  revalidatePath(`/agreements/${id}`);
  return { ok: true };
}

/**
 * The projects an agreement can be attached to.
 *
 * Every lifecycle stage, newest first — the usual case is a walk-in who has
 * just been made a lead, which is exactly where a just-created project sits.
 */
export async function attachableProjects(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(projects)
    .innerJoin(contacts, eq(projects.contactId, contacts.id))
    .orderBy(desc(projects.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: [row.firstName, row.lastName].filter(Boolean).join(" "),
  }));
}

/**
 * Delete an agreement.
 *
 * The same shape as `deleteQuotation`, and deliberately so. The row stays —
 * who the parties were, what clause 19.1 said and who removed it are not
 * things to lose — while the .docx, the copy filed into the project's
 * documents and its place in every list all go.
 *
 * Attached to a project means admin only, standalone means whoever may
 * write agreements. Nothing here names a role: the two permissions carry
 * that, and deleting detaches first so the "one filed agreement per project"
 * index is left clear.
 *
 * A signed agreement is not treated differently from a draft. It is the same
 * decision either way — an admin removing a record of what was signed — and
 * the audit entry carries the status it had when it went.
 */
export async function deleteAgreement(
  id: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();

  const [row] = await db
    .select({
      consumerName: agreements.consumerName,
      status: agreements.status,
      totalValue: agreements.totalValue,
      executionDate: agreements.executionDate,
      projectId: agreements.projectId,
      documentId: agreements.documentId,
      isPrimary: agreements.isPrimary,
      s3Key: agreements.s3Key,
    })
    .from(agreements)
    .where(live(id))
    .limit(1);
  if (!row) return { ok: false, error: "That agreement no longer exists." };

  const attached = Boolean(row.projectId);
  if (!can(actor, attached ? "agreement.delete.filed" : "agreement.delete")) {
    return {
      ok: false,
      error: attached
        ? "This agreement is attached to a project, so only an admin can delete it. Detach it first, or mark it Cancelled."
        : "You are not allowed to delete an agreement.",
    };
  }

  await db.transaction(async (tx) => {
    if (row.documentId) {
      await tx.delete(documents).where(eq(documents.id, row.documentId));
    }

    await tx
      .update(agreements)
      .set({
        deletedBy: actor!.id,
        deletedAt: new Date(),
        projectId: null,
        isPrimary: false,
        documentId: null,
        updatedAt: new Date(),
      })
      .where(eq(agreements.id, id));
  });

  // Outside the transaction, for the reason given in `deleteQuotation`.
  if (row.s3Key) await deleteDocumentObject(row.s3Key);

  await writeAudit({
    actorId: actor!.id,
    action: "agreement.delete",
    entityType: "agreement",
    entityId: id,
    projectId: row.projectId,
    before: {
      consumer: row.consumerName,
      status: row.status,
      value: row.totalValue,
      executionDate: row.executionDate,
      projectId: row.projectId,
      wasPrimary: row.isPrimary,
    },
    reason: reason?.trim() || null,
  });

  revalidate(row.projectId);
  revalidatePath(`/agreements/${id}`);
  return { ok: true };
}

/**
 * The link to the .docx.
 *
 * Asked for per click rather than rendered into the page, so the permission
 * check happens when the file is wanted. The URL points at this app's own
 * file route, which checks the permission again before a byte is served.
 * Reads are logged: an agreement states a price.
 */
export async function getAgreementUrl(
  id: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.read");

  const [row] = await db
    .select({
      s3Key: agreements.s3Key,
      consumerName: agreements.consumerName,
      projectId: agreements.projectId,
    })
    .from(agreements)
    .where(live(id))
    .limit(1);

  if (!row) return { ok: false, error: "That agreement no longer exists." };
  if (!row.s3Key) return { ok: false, error: "No file has been built for this agreement yet." };

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.download",
    entityType: "agreement",
    entityId: id,
    projectId: row.projectId,
    after: { consumer: row.consumerName },
  });

  return { ok: true, url: fileHref("agreement", id, { download: true }) };
}

/**
 * What the project still has to know before an agreement can be written
 * without a person looking at it.
 *
 * Codes rather than sentences because they travel to the form in the URL,
 * where the page turns them back into words from its own list — a querystring
 * is editable, and nothing a stranger puts in one should reach the screen.
 */
export type MissingForAgreement = "name" | "address" | "cost" | "instalments";

export type QuickGenerateResult =
  /** Built, or already there — the caller opens it. */
  | { ok: true; id: string; existing: boolean }
  /** Not enough is known yet; the caller opens the form, already filled. */
  | { ok: false; needsForm: true; missing: MissingForAgreement[] }
  | { ok: false; needsForm: false; error: string };

/**
 * The Stage 1 button: draw up the agreement from whatever the project
 * already knows.
 *
 * Stage 1 is where the office is sitting with the customer filling in the
 * onboarding form, and it is where they are asked for the agreement — so
 * the button is there rather than only at stage 2.
 *
 * It generates straight away when it can, and otherwise hands over to the
 * form with every known field already filled, so what is typed is only what
 * is genuinely missing. The deliberate line is that it will not generate a
 * contract with a blank where the cost goes: a name is simply whatever is
 * recorded — a first name with no surname prints as the first name — but
 * clause 19.1 either states a figure or the form asks for one.
 *
 * Pressing it a second time opens the agreement already drawn up rather
 * than quietly making another.
 */
export async function quickGenerateAgreement(projectId: string): Promise<QuickGenerateResult> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  // Already drawn up — open it. Regenerating is a button on that page, and
  // a second press here must not leave two contracts on one project.
  const [already] = await db
    .select({ id: agreements.id })
    .from(agreements)
    .where(and(eq(agreements.projectId, projectId), eq(agreements.isPrimary, true)))
    .limit(1);
  if (already) return { ok: true, id: already.id, existing: true };

  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  const prefill = await prefillFromProject(projectId, emptyAgreement(todayValue));
  if (!prefill.found) {
    return { ok: false, needsForm: false, error: "That project no longer exists." };
  }

  const values = prefill.values;
  const total = Number(values.totalValue) || 0;
  const scheduled = values.milestones.filter((m) => Number(m.amount) > 0);

  // What the form would refuse anyway, named so the page can say why it is
  // asking rather than just appearing.
  const missing: MissingForAgreement[] = [];
  if (!values.consumerName.trim()) missing.push("name");
  // Not `consumerAddress`: that joins the address and the PIN code, so a
  // contact with only a PIN would pass and the agreement would recite
  // "having address at 460001".
  if (!prefill.addressLineKnown) missing.push("address");
  if (total <= 0) missing.push("cost");
  else if (scheduled.length === 0) missing.push("instalments");

  if (missing.length > 0) return { ok: false, needsForm: true, missing };

  const created = await createAgreement({
    projectId,
    consumerTitle: values.consumerTitle,
    consumerName: values.consumerName,
    consumerAddress: values.consumerAddress,
    executionDate: values.executionDate,
    totalValue: values.totalValue,
    valueSource: values.valueSource,
    milestones: scheduled.map((m) => ({ label: m.label, amount: m.amount })),
  } as unknown as AgreementInput);

  if (!created.ok) return { ok: false, needsForm: false, error: created.error };

  revalidatePath(`/projects/${projectId}/stage-1`);
  return { ok: true, id: created.id, existing: false };
}

/**
 * Rebuild the agreement filed against a project.
 *
 * The entry point `regenerateGeneratedDocument` uses for `AGREEMENT`, kept
 * because the documents page offers Rebuild for every generated file while
 * the agreement itself is now made under its own tab. It rebuilds the
 * project's primary agreement; with none, it says where to make one rather
 * than inventing a draft nobody has agreed.
 */
export async function regenerateProjectAgreement(
  projectId: string,
): Promise<{ ok: true; documentId: string; fileName: string } | { ok: false; error: string }> {
  const actor = await getActor();
  assertCan(actor, "agreement.write");

  const [row] = await db
    .select({ id: agreements.id })
    .from(agreements)
    .where(and(eq(agreements.projectId, projectId), eq(agreements.isPrimary, true)))
    .limit(1);

  if (!row) {
    return {
      ok: false,
      error:
        "This project has no agreement to rebuild. Draw one up under Agreements — the consumer and the cost are filled in for you.",
    };
  }

  const rendered = await renderAndStore(row.id);
  if (!rendered.ok) return rendered;

  const [after] = await db
    .select({ documentId: agreements.documentId, fileName: agreements.fileName })
    .from(agreements)
    .where(eq(agreements.id, row.id))
    .limit(1);

  if (!after?.documentId || !after.fileName) {
    return { ok: false, error: "The agreement was rebuilt but could not be filed." };
  }

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "agreement.regenerate",
    entityType: "agreement",
    entityId: row.id,
    projectId,
    after: { fileName: after.fileName },
  });

  revalidate(projectId);
  return { ok: true, documentId: after.documentId, fileName: after.fileName };
}
