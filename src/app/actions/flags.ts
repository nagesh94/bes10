"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, flags, loadChangeRequests, nameChangeRequests } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";

export type FlagActionResult = { ok: true } | { ok: false; error: string };

export async function saveNameChange(
  projectId: string,
  flagId: number,
  input: { khasraNumber: string },
): Promise<FlagActionResult> {
  const actor = await getActor();
  assertCan(actor, "flag.resolve");

  const set = {
    khasraNumber: input.khasraNumber.trim() || null,
    submittedAt: new Date(),
  };

  await db
    .insert(nameChangeRequests)
    .values({ flagId, ...set })
    .onConflictDoUpdate({ target: nameChangeRequests.flagId, set });

  await db.update(flags).set({ status: "IN_PROGRESS" }).where(eq(flags.id, flagId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "flag.nameChange.save",
    entityType: "flag",
    entityId: String(flagId),
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/flags`);
  return { ok: true };
}

export async function saveLoadChange(
  projectId: string,
  flagId: number,
  input: { acknowledgementNo: string; newSanctionedKw: string },
): Promise<FlagActionResult> {
  const actor = await getActor();
  assertCan(actor, "flag.resolve");

  const approved = input.newSanctionedKw.trim();
  const set = {
    acknowledgementNo: input.acknowledgementNo.trim() || null,
    newSanctionedKw: approved || null,
    appliedAt: new Date(),
    approvedAt: approved ? new Date() : null,
  };

  await db
    .insert(loadChangeRequests)
    .values({ flagId, ...set })
    .onConflictDoUpdate({ target: loadChangeRequests.flagId, set });

  await db.update(flags).set({ status: "IN_PROGRESS" }).where(eq(flags.id, flagId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "flag.loadChange.save",
    entityType: "flag",
    entityId: String(flagId),
    projectId,
    after: set,
  });

  revalidatePath(`/projects/${projectId}/flags`);
  return { ok: true };
}

/**
 * Links an uploaded document to the name-change request.
 *
 * The upload itself is generic; this is what makes a given file *the*
 * applicant photo or *the* NOC for this flag.
 */
export async function attachNameChangeDoc(
  projectId: string,
  flagId: number,
  slot: "applicantPhoto" | "noc",
  documentId: string,
): Promise<FlagActionResult> {
  const actor = await getActor();
  assertCan(actor, "flag.resolve");

  const set =
    slot === "applicantPhoto"
      ? { applicantPhotoDocId: documentId }
      : { nocDocumentId: documentId };

  await db
    .insert(nameChangeRequests)
    .values({ flagId, ...set })
    .onConflictDoUpdate({ target: nameChangeRequests.flagId, set });

  await db.update(flags).set({ status: "IN_PROGRESS" }).where(eq(flags.id, flagId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: `flag.nameChange.attach.${slot}`,
    entityType: "flag",
    entityId: String(flagId),
    projectId,
    after: { documentId },
  });

  revalidatePath(`/projects/${projectId}/flags`);
  return { ok: true };
}

/**
 * An admin override. Needs a written reason, which goes into the audit log
 * against their name — a waiver with no explanation is worse than no waiver.
 */
export async function waiveFlag(
  projectId: string,
  flagId: number,
  reason: string,
): Promise<FlagActionResult> {
  const actor = await getActor();
  assertCan(actor, "flag.waive");

  if (reason.trim().length < 10) {
    return { ok: false, error: "Write a reason of at least 10 characters — it goes on the record." };
  }

  await db
    .update(flags)
    .set({
      status: "WAIVED",
      waiverReason: reason.trim(),
      resolvedBy: actor.id,
      resolvedAt: new Date(),
    })
    .where(eq(flags.id, flagId));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "flag.waive",
    entityType: "flag",
    entityId: String(flagId),
    projectId,
    reason: reason.trim(),
  });

  revalidatePath(`/projects/${projectId}/flags`);
  revalidatePath(`/projects/${projectId}/stage-1`);
  return { ok: true };
}
