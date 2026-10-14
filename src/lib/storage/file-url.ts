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

const KINDS: readonly FileKind[] = ["document", "photo", "quotation", "agreement"];
const VARIANTS: readonly FileVariant[] = ["original", "portal", "thumb"];

export function isFileKind(value: string): value is FileKind {
  return (KINDS as readonly string[]).includes(value);
}

export function isFileVariant(value: string): value is FileVariant {
  return (VARIANTS as readonly string[]).includes(value);
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
