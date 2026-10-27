import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { UPLOAD_MAX_KB } from "@/lib/env";
import { installerIdsFor } from "@/lib/projects/crew";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { isUploadKind, projectIdFromTempKey, type UploadKind } from "@/lib/storage/file-url";
import { putTempObject } from "@/lib/storage/operations";

/**
 * Takes the browser's file and streams it into the temp bucket.
 *
 * The upload half of `/api/files/...`, and it exists for the same reason that
 * route does — plus one the download side never had.
 *
 * The browser used to PUT straight at a presigned storage URL. That made
 * uploads the only thing in this app that needed the *user's own* network to
 * reach Neon: page loads, sign-in and downloads all go through this server,
 * which has working DNS. Some consumer resolvers answer REFUSED for
 * `*.c-3.ap-southeast-1.aws.neon.tech` while happily serving `neon.tech` and
 * `amazonaws.com`, so on those networks the CRM looked perfectly healthy and
 * only uploads failed — with the single unhelpful error `fetch` produces for
 * a request that never left the browser. A crew on a roof could not tell that
 * from a weak signal, and neither could anyone reading the server logs,
 * because nothing reached the server at all.
 *
 * The second reason: a presigned PUT URL is a bearer token. Anyone holding
 * one could write into the temp bucket for ten minutes with no session, and
 * it carried the storage endpoint and the live access-key id in its query
 * string. That is the same objection that moved downloads behind this app,
 * and it applied just as well here.
 *
 * What this is NOT: a general file sink. It writes only into the temp bucket,
 * only under the `incoming/<projectId>/...` key the matching server action
 * minted, and only for a caller who may upload to that project. The key names
 * the project, so the permission that gets checked is the one for the project
 * the bytes actually land under rather than one the caller asserts beside it.
 * Nothing here promotes the object — `finaliseUpload` and `finalisePhoto`
 * still do that, and still re-check everything themselves.
 */

export const dynamic = "force-dynamic";

/**
 * Node, not Edge: the AWS SDK needs a Node stream and S3 needs the length up
 * front, so the body is piped through rather than buffered. A 12 MB rooftop
 * photo never sits in this process in one piece.
 */
export const runtime = "nodejs";

const MAX_BYTES = UPLOAD_MAX_KB * 1024;

async function allowed(kind: UploadKind, projectId: string): Promise<boolean> {
  const actor = await getActor();
  if (!actor) return false;

  if (kind === "document") return can(actor, "document.upload");

  // A photo is scoped to the crew on the job, exactly as `requestPhotoUpload`
  // and the download route both scope it.
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return false;

  return can(actor, "photo.upload", {
    assignedEmployeeId: project.assignedEmployeeId ?? null,
    assignedInstallerIds: await installerIdsFor(projectId),
  });
}

export async function PUT(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const key = params.get("key") ?? "";

  if (!isUploadKind(kind)) return new Response("Unknown upload kind.", { status: 400 });

  // Signed out first, so a stranger probing keys learns nothing from the
  // difference between "malformed" and "not yours".
  if (!(await getActor())) return new Response("Please sign in.", { status: 401 });

  const projectId = projectIdFromTempKey(key);
  if (!projectId) return new Response("That is not an upload key.", { status: 400 });

  if (!(await allowed(kind, projectId))) return new Response("Not allowed.", { status: 403 });

  /**
   * S3 will not take a body of unknown length, and we will not take one
   * either: without a declared length there is nothing to check a cap
   * against, and the first sign of trouble would be the bucket bill.
   */
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isInteger(declared) || declared <= 0) {
    return new Response("A Content-Length is required.", { status: 411 });
  }
  if (declared > MAX_BYTES) {
    return new Response(`That file is larger than ${Math.floor(UPLOAD_MAX_KB / 1024)} MB.`, {
      status: 413,
    });
  }
  if (!request.body) return new Response("Nothing was sent.", { status: 400 });

  const contentType = request.headers.get("content-type") || "application/octet-stream";

  /**
   * The cast bridges two spellings of the same object, not two objects: the
   * fetch `Request` carries the DOM `ReadableStream` type while
   * `Readable.fromWeb` is typed against the one from `node:stream/web`. They
   * are the same stream at runtime — only the declarations differ.
   */
  const body = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>);

  try {
    await putTempObject(key, contentType, body, declared);
  } catch (err) {
    // The key is useful and is not leaving the server. The browser gets a
    // 502 so it can tell "storage is unwell" from "you may not do that".
    console.error(`[uploads] ${kind} ${key} failed to reach storage:`, err);
    return new Response("That file could not be written to storage.", { status: 502 });
  }

  return new Response(null, { status: 204 });
}
