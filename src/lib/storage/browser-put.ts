/**
 * The browser's half of an upload: the presigned PUT that sends the file
 * straight to storage, without passing through the Next server.
 *
 * This is deliberately the only module in `lib/storage` that a client
 * component may import — it touches no credential and no AWS SDK, just
 * `fetch` and a URL the server signed.
 *
 * It exists as a shared helper because the document slot and the photo grid
 * both make this call, and both used to report its one interesting failure as
 * "something went wrong".
 */
export type BrowserPutResult = { ok: true } | { ok: false; error: string };

export async function putPresigned(uploadUrl: string, file: File): Promise<BrowserPutResult> {
  let res: Response;

  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  } catch (err) {
    /**
     * Nothing left the browser.
     *
     * A PUT the storage bucket's CORS policy does not allow fails here, at
     * the preflight, before the request is ever sent — and `fetch` reports it
     * identically to a dead connection, with no status to show. That is worth
     * naming in the message, because it is the one part of this path that no
     * server-side test can exercise: Node does not enforce CORS, so the smoke
     * tests pass against a bucket no browser can upload to.
     *
     * `npm run storage:cors` is the fix; see `lib/storage/operations`.
     */
    console.error("[upload] the presigned PUT never left the browser", err);
    return {
      ok: false,
      error:
        "The upload could not reach storage. Check the connection — if that is fine, " +
        "storage is refusing uploads from this site and an administrator has to allow it.",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Storage refused the upload (${res.status}). Please try again.`,
    };
  }

  return { ok: true };
}
