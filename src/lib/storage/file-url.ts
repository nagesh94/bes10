/**
 * Where the browser asks for a stored file.
 *
 * Every link to a document, photo, quotation or agreement points at this
 * app, never at the bucket. It used to be a presigned storage URL, which
 * worked but put three things in the address bar of whoever opened it: the
 * Neon endpoint, the full object key — customer's name included — and the
 * live access-key id in `X-Amz-Credential`. Worse, it kept working for five
 * minutes for anyone it was forwarded to, logged in or not.
 *
 * These URLs carry none of that and are not bearer tokens: the route behind
 * them re-checks the session and the permission on every single request, so
 * a pasted link is useless to anyone who cannot already open the file in the
 * app.
 *
 * They are also stable per file, which presigned URLs were not — a photo
 * thumbnail now hits the browser cache on the next render instead of being
 * fetched again under a freshly signed URL.
 */

export type FileKind = "document" | "photo" | "quotation" | "agreement";
export type FileVariant = "original" | "portal" | "thumb";

/** The two things a browser may send up. Quotations and agreements are generated. */
export type UploadKind = "document" | "photo";

const KINDS: readonly FileKind[] = ["document", "photo", "quotation", "agreement"];
const VARIANTS: readonly FileVariant[] = ["original", "portal", "thumb"];
const UPLOAD_KINDS: readonly UploadKind[] = ["document", "photo"];

export function isFileKind(value: string): value is FileKind {
  return (KINDS as readonly string[]).includes(value);
}

export function isFileVariant(value: string): value is FileVariant {
  return (VARIANTS as readonly string[]).includes(value);
}

export function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as readonly string[]).includes(value);
}

/**
 * Where the browser sends a file, which is this app and never the bucket.
 *
 * The mirror of `fileHref`, and for the same reason it exists. Uploads used
 * to go straight from the browser to a presigned storage URL, which made them
 * the one thing in the app that needed the *user's* network to reach the
 * storage host — and on a network whose resolver refuses that host, every
 * other feature kept working while uploads failed. Pointing at our own origin
 * removes that dependency, and takes the storage endpoint and the access-key
 * id out of the browser at the same time.
 *
 * Like `fileHref`, this is not a bearer token: `PUT /api/uploads` re-checks
 * the session and the permission against the project named in the key.
 */
export function uploadHref(kind: UploadKind, tempKey: string): string {
  const query = new URLSearchParams({ kind, key: tempKey });
  return `/api/uploads?${query.toString()}`;
}

/**
 * The key the browser is allowed to write, and the project it belongs to.
 *
 * Both server actions mint `incoming/<projectId>/<uuid>-<name>`, and the
 * upload route re-derives the project from the key so the permission check
 * covers the project the bytes will actually land under — not one the caller
 * claims separately. Anything that is not exactly this shape is refused, so a
 * crafted key cannot climb out of `incoming/` or carry a path segment of its
 * own.
 */
const TEMP_KEY = /^incoming\/([0-9a-zA-Z_-]+)\/[0-9a-fA-F-]{36}-[A-Za-z0-9._-]{1,80}$/;

export function projectIdFromTempKey(key: string): string | null {
  return TEMP_KEY.exec(key)?.[1] ?? null;
}

/**
 * `download` asks the route for `Content-Disposition: attachment`, which is
 * what makes the browser save the file under its own name instead of
 * displaying it. Left off, the file opens inline where the browser can show
 * it — and the route still forces a download for anything it refuses to
 * render inline.
 */
export function fileHref(
  kind: FileKind,
  id: string,
  options: { variant?: FileVariant; download?: boolean } = {},
): string {
  const query = new URLSearchParams();
  if (options.variant && options.variant !== "original") query.set("variant", options.variant);
  if (options.download) query.set("download", "1");

  const search = query.toString();
  return `/api/files/${kind}/${encodeURIComponent(id)}${search ? `?${search}` : ""}`;
}
