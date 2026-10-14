import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { agreements, documents, photos, projects, quotations } from "@/lib/db/schema";
import { installerIdsFor } from "@/lib/projects/crew";
import { can } from "@/lib/rbac/permissions";
import { getActor } from "@/lib/session";
import { isFileKind, isFileVariant, type FileKind, type FileVariant } from "@/lib/storage/file-url";
import { streamDocumentObject } from "@/lib/storage/operations";

/**
 * Serves one stored file through this app instead of from the bucket.
 *
 * The whole point is that the browser never learns where the file actually
 * lives. The old presigned links put the Neon endpoint, the object key and
 * the live access-key id into the address bar, and worked for five minutes
 * in anybody's hands. Here the session and the permission are re-checked on
 * every request — this route is the gate, not the server action that handed
 * out the link, so a copied URL is worth nothing to a logged-out stranger.
 *
 * Reads are not audited here. The actions that produce these URLs
 * (`getDocumentUrl`, `getQuotationUrl`, `getAgreementUrl`) still write the
 * audit row at the moment the file is asked for, which keeps one entry per
 * click — a browser that re-fetches a PDF for its own viewer must not look
 * like a second read of someone's Aadhaar.
 */

export const dynamic = "force-dynamic";

/**
 * What may be shown inline; everything else is forced to download.
 *
 * This matters more than it did before: these files now come back from the
 * app's own origin, so an uploaded SVG or HTML file rendered inline would
 * run its script against a logged-in session. PDFs and raster photos are
 * the only things anyone needs to look at in a tab, and they cannot script.
 */
const INLINE_SAFE = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type Resolved =
  | { ok: true; key: string; fileName: string | null }
  | { ok: false; status: number; message: string };

const NOT_FOUND: Resolved = { ok: false, status: 404, message: "No such file." };
const NOT_ALLOWED: Resolved = { ok: false, status: 403, message: "Not allowed." };

/** The timestamp every key carries is a storage detail, not part of the name. */
function nameFromKey(key: string): string {
  return key.split("/").pop()?.replace(/^\d{10,}-/, "") ?? "file";
}

async function resolveDocument(id: string, variant: FileVariant): Promise<Resolved> {
  const actor = await getActor();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.deletedAt) return NOT_FOUND;
  if (!can(actor, "document.read")) return NOT_ALLOWED;

  const key =
    variant === "portal"
      ? doc.s3KeyPortal
      : variant === "thumb"
        ? doc.s3KeyThumb
        : doc.s3KeyOriginal;

  if (!key) return NOT_FOUND;
  return { ok: true, key, fileName: doc.fileName ?? nameFromKey(key) };
}

/**
 * A photo is read with `project.read` and the project's assignment context,
 * because an installer's permission is scoped to the jobs they are on — the
 * same reason `photoAccess` in the photo actions loads the crew first.
 */
async function resolvePhoto(id: string, variant: FileVariant): Promise<Resolved> {
  const actor = await getActor();
  const [row] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  if (!row) return NOT_FOUND;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, row.projectId))
    .limit(1);
  if (!project) return NOT_FOUND;

  const allowed = can(actor, "project.read", {
    assignedEmployeeId: project.assignedEmployeeId ?? null,
    assignedInstallerIds: await installerIdsFor(row.projectId),
  });
  if (!allowed) return NOT_ALLOWED;

  const key = variant === "thumb" ? row.s3KeyThumb : row.s3KeyOriginal;
  if (!key) return NOT_FOUND;
  return { ok: true, key, fileName: nameFromKey(key) };
}

async function resolveQuotation(id: string): Promise<Resolved> {
  const actor = await getActor();
  if (!can(actor, "quotation.read")) return NOT_ALLOWED;

  const [row] = await db
    .select({ s3Key: quotations.s3Key, fileName: quotations.fileName })
    .from(quotations)
    .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
    .limit(1);

  if (!row?.s3Key) return NOT_FOUND;
  return { ok: true, key: row.s3Key, fileName: row.fileName ?? nameFromKey(row.s3Key) };
}

async function resolveAgreement(id: string): Promise<Resolved> {
  const actor = await getActor();
  if (!can(actor, "agreement.read")) return NOT_ALLOWED;

  const [row] = await db
    .select({ s3Key: agreements.s3Key, fileName: agreements.fileName })
    .from(agreements)
    .where(and(eq(agreements.id, id), isNull(agreements.deletedAt)))
    .limit(1);

  if (!row?.s3Key) return NOT_FOUND;
  return { ok: true, key: row.s3Key, fileName: row.fileName ?? nameFromKey(row.s3Key) };
}

function resolve(kind: FileKind, id: string, variant: FileVariant): Promise<Resolved> {
  switch (kind) {
    case "document":
      return resolveDocument(id, variant);
    case "photo":
      return resolvePhoto(id, variant === "thumb" ? "thumb" : "original");
    case "quotation":
      return resolveQuotation(id);
    case "agreement":
      return resolveAgreement(id);
  }
}

/**
 * Both forms of the filename: the quoted ASCII one every browser has always
 * understood, and the UTF-8 one for the names that carry an accent.
 */
function contentDisposition(mode: "inline" | "attachment", name: string | null): string {
  if (!name) return mode;
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await context.params;
  if (!isFileKind(kind)) return new Response("No such file.", { status: 404 });

  const params = new URL(request.url).searchParams;
  const requested = params.get("variant") ?? "original";
  const variant: FileVariant = isFileVariant(requested) ? requested : "original";

  // Signed out, say nothing about whether the file exists.
  if (!(await getActor())) return new Response("Please sign in.", { status: 401 });

  const found = await resolve(kind, id, variant);
  if (!found.ok) return new Response(found.message, { status: found.status });

  let object: Awaited<ReturnType<typeof streamDocumentObject>>;
  try {
    object = await streamDocumentObject(found.key);
  } catch (err) {
    // The row says there is a file and storage says there is not. Log the
    // key — it is useful, and it is not leaving the server.
    console.error(`[files] ${kind} ${id} missing object ${found.key}:`, err);
    return new Response("That file could not be read from storage.", { status: 502 });
  }

  const wantsDownload = params.get("download") === "1";
  const mode = wantsDownload || !INLINE_SAFE.has(object.contentType) ? "attachment" : "inline";

  return new Response(object.body, {
    headers: {
      "Content-Type": object.contentType,
      ...(object.contentLength === null ? {} : { "Content-Length": String(object.contentLength) }),
      "Content-Disposition": contentDisposition(mode, found.fileName),
      // A thumbnail is re-requested every time a gallery renders and never
      // changes, since keys are unique per upload. The full file is not
      // cached: it is somebody's Aadhaar on a shared office machine.
      "Cache-Control": variant === "thumb" ? "private, max-age=300" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
