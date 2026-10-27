/**
 * The browser's half of an upload: a PUT to this app, which streams the file
 * on into storage.
 *
 * This is deliberately the only module in `lib/storage` that a client
 * component may import — it touches no credential and no AWS SDK, just
 * `fetch` and a URL from `uploadHref`.
 *
 * It used to send the file straight to a presigned storage URL. That was one
 * hop fewer, and it was also the only thing in this app that depended on the
 * *user's* network being able to resolve the storage host — which some
 * consumer resolvers refuse while serving everything else, so the app looked
 * healthy and only uploads failed. The destination is now this app's own
 * origin: same host the page came from, so if the CRM loaded at all, the
 * upload can reach it.
 *
 * It exists as a shared helper because the document slot and the photo grid
 * both make this call, and both used to report its one interesting failure as
 * "something went wrong".
 */
export type BrowserPutResult = { ok: true } | { ok: false; error: string };

export async function putUpload(uploadUrl: string, file: File): Promise<BrowserPutResult> {
  let res: Response;

  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  } catch {
    /**
     * Nothing left the browser.
     *
     * Same origin as the page, so this is no longer the CORS trap it was —
     * there is no preflight to fail, and no bucket policy standing between
     * the phone and the server. What is left is a genuinely dropped
     * connection, which on a rooftop is the likely story anyway.
     */
    return {
      ok: false,
      error: "The upload could not reach the server. Check the connection and try again.",
    };
  }

  if (!res.ok) {
    /**
     * The route says plainly what went wrong — too large, not allowed, signed
     * out, storage unwell — and every one of those is worth showing instead
     * of a status code. It is our own endpoint, so the body is ours too: no
     * storage internals can appear in it.
     */
    const said = (await res.text().catch(() => "")).trim();
    return {
      ok: false,
      error: said || `The upload failed (${res.status}). Please try again.`,
    };
  }

  return { ok: true };
}
