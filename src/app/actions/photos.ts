"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, photos, projects } from "@/lib/db/schema";
import { newId } from "@/lib/projects/code";
import { installerIdsFor } from "@/lib/projects/crew";
import { assertCan, can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { documentKey } from "@/lib/storage/client";
import {
  deleteTempObject,
  ensureBuckets,
  getTempObject,
  presignDownload,
  presignUpload,
  putDocument,
} from "@/lib/storage/operations";
import { buildVariants, stampGeo } from "@/lib/storage/variants";

export type PhotoType =
  | "SITE_SURVEY"
  | "CUSTOMER_WITH_PANEL"
  | "CUSTOMER_WITH_INVERTER"
  | "EARTHING_AC"
  | "EARTHING_DC"
  | "EARTHING_PIT"
  | "SITE_OVERVIEW";

/**
 * Who may touch this project's photos.
 *
 * The assignment context has to be loaded and passed, because an installer's
 * permission is scoped to `assigned` and `can` fails closed without it —
 * checking `photo.upload` with no resource denies the very person standing on
 * the roof.
 */
async function photoAccess(projectId: string) {
  const actor = await getActor();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return {
    actor,
    project: project ?? null,
    resource: {
      assignedEmployeeId: project?.assignedEmployeeId ?? null,
      assignedInstallerIds: project ? await installerIdsFor(projectId) : [],
    },
  };
}

export type PhotoPresign =
  | { ok: true; uploadUrl: string; tempKey: string }
  | { ok: false; error: string };

export async function requestPhotoUpload(
  projectId: string,
  photoType: PhotoType,
  fileName: string,
  contentType: string,
): Promise<PhotoPresign> {
  const access = await photoAccess(projectId);
  if (!access.project) return { ok: false, error: "That project no longer exists." };
  assertCan(access.actor, "photo.upload", access.resource);

  if (!contentType.startsWith("image/")) {
    return { ok: false, error: "Only photos can go here." };
  }

  await ensureBuckets();
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const tempKey = `incoming/${projectId}/${crypto.randomUUID()}-${safe}`;
  return { ok: true, uploadUrl: await presignUpload(tempKey, contentType), tempKey };
}

export type PhotoFinalise =
  | { ok: true; photoId: string; stamped: boolean }
  | { ok: false; error: string };

/**
 * Stores a field photo.
 *
 * Coordinates come from the browser at shutter time, never from EXIF — iOS
 * Safari strips EXIF GPS from web uploads, so a photo that looked geotagged
 * on the phone arrives with nothing. When coordinates are present they are
 * also burned into the corner of the image, because the DISCOM wants to see
 * them on the print rather than take our word for it.
 */
export async function finalisePhotoUpload(
  projectId: string,
  photoType: PhotoType,
  tempKey: string,
  fileName: string,
  geo?: { latitude: number; longitude: number; accuracyM?: number; capturedAt?: string },
): Promise<PhotoFinalise> {
  const access = await photoAccess(projectId);
  if (!access.project) return { ok: false, error: "That project no longer exists." };
  assertCan(access.actor, "photo.upload", access.resource);
  const actor = access.actor;

  let source: { body: Buffer; contentType: string };
  try {
    source = await getTempObject(tempKey);
  } catch {
    return { ok: false, error: "The upload did not arrive. Try again." };
  }

  const capturedAt = geo?.capturedAt ? new Date(geo.capturedAt) : new Date();

  let working = source.body;
  let stamped = false;
  if (geo && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
    try {
      working = await stampGeo(working, {
        latitude: geo.latitude,
        longitude: geo.longitude,
        capturedAt,
      });
      stamped = true;
    } catch {
      // A failed stamp must not lose the photo — keep the original.
    }
  }

  const variants = await buildVariants(working, stamped ? "image/jpeg" : source.contentType);

  const keyOriginal = documentKey(projectId, photoType, "original", fileName);
  await putDocument(keyOriginal, variants.original.body, variants.original.contentType);

  let keyPortal: string | null = null;
  if (variants.portal) {
    keyPortal = documentKey(projectId, photoType, "portal", `${fileName}.jpg`);
    await putDocument(keyPortal, variants.portal.body, variants.portal.contentType);
  }
  let keyThumb: string | null = null;
  if (variants.thumb) {
    keyThumb = documentKey(projectId, photoType, "thumb", `${fileName}.jpg`);
    await putDocument(keyThumb, variants.thumb.body, variants.thumb.contentType);
  }

  await deleteTempObject(tempKey);

  const photoId = newId("pho");
  await db.insert(photos).values({
    id: photoId,
    projectId,
    photoType,
    s3KeyOriginal: keyOriginal,
    s3KeyPortal: keyPortal,
    s3KeyThumb: keyThumb,
    latitude: geo ? String(geo.latitude) : null,
    longitude: geo ? String(geo.longitude) : null,
    accuracyM: geo?.accuracyM ? String(geo.accuracyM) : null,
    capturedAt,
    uploadedBy: actor.id,
  });

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "photo.upload",
    entityType: "photo",
    entityId: photoId,
    projectId,
    after: { photoType, fileName, geotagged: stamped },
  });

  // A photo can be added from stage 1 (site survey) or stage 4 (post
  // installation), and either changes the project's gate.
  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath(`/projects/${projectId}/stage-4`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/installer/${projectId}/survey`);
  revalidatePath(`/installer/${projectId}/installation`);
  revalidatePath(`/installer/${projectId}`);
  revalidatePath("/installer");
  return { ok: true, photoId, stamped };
}

export async function deletePhoto(
  projectId: string,
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await photoAccess(projectId);
  if (!access.project) return { ok: false, error: "That project no longer exists." };
  assertCan(access.actor, "photo.upload", access.resource);
  const actor = access.actor;

  // The object stays in the versioned bucket; only the row goes. Nothing in
  // this system hard-deletes a file someone may later be asked to produce.
  await db.delete(photos).where(and(eq(photos.id, photoId), eq(photos.projectId, projectId)));

  await db.insert(auditLog).values({
    actorId: actor.id,
    action: "photo.remove",
    entityType: "photo",
    entityId: photoId,
    projectId,
  });

  // A photo can be added from stage 1 (site survey) or stage 4 (post
  // installation), and either changes the project's gate.
  revalidatePath(`/projects/${projectId}/stage-1`);
  revalidatePath(`/projects/${projectId}/stage-4`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/installer/${projectId}/survey`);
  revalidatePath(`/installer/${projectId}/installation`);
  revalidatePath(`/installer/${projectId}`);
  revalidatePath("/installer");
  return { ok: true };
}

export async function getPhotoUrl(
  photoId: string,
  variant: "original" | "thumb" = "original",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const [row] = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1);
  if (!row) return { ok: false, error: "No such photo." };

  const access = await photoAccess(row.projectId);
  if (!can(access.actor, "project.read", access.resource)) {
    return { ok: false, error: "Not allowed." };
  }

  const key = variant === "thumb" ? row.s3KeyThumb : row.s3KeyOriginal;
  if (!key) return { ok: false, error: "That variant does not exist." };

  return { ok: true, url: await presignDownload(key) };
}

/** Thumbnail URLs for a whole gallery, in one round trip. */
export async function getPhotoThumbUrls(
  projectId: string,
  photoType: PhotoType,
): Promise<Array<{ id: string; url: string | null; capturedAt: Date | null; lat: string | null; lng: string | null }>> {
  const access = await photoAccess(projectId);
  if (!access.project || !can(access.actor, "project.read", access.resource)) return [];

  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.projectId, projectId), eq(photos.photoType, photoType)));

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      url: r.s3KeyThumb ? await presignDownload(r.s3KeyThumb, 900) : null,
      capturedAt: r.capturedAt,
      lat: r.latitude,
      lng: r.longitude,
    })),
  );
}
