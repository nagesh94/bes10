/**
 * Full upload round trip, exactly as the browser does it:
 * presign → direct PUT to storage → server pulls it back → variants → store.
 *
 *   npx tsx scripts/smoke-upload.mjs <projectId>
 */
import sharp from "sharp";
import {
  UPLOAD_ORIGINS,
  deleteDocumentObject,
  deleteTempObject,
  ensureBuckets,
  getDocumentObject,
  getTempObject,
  presignUpload,
  putDocument,
} from "../src/lib/storage/operations.ts";
import { buildVariants } from "../src/lib/storage/variants.ts";
import { PORTAL_MAX_KB, documentKey } from "../src/lib/storage/client.ts";

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  process.exitCode = 1;
};
const kb = (n) => Math.round(n / 1024);

const projectId = process.argv[2] ?? "prj_smoke";

try {
  await ensureBuckets();

  // A4 at ~300 dpi, which is what a scanned khasra actually looks like.
  const scan = await sharp({
    create: {
      width: 2480,
      height: 3508,
      channels: 3,
      noise: { type: "gaussian", mean: 190, sigma: 40 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

  console.log(`\n  scanned khasra: ${kb(scan.byteLength)} KB\n`);

  const tempKey = `incoming/${projectId}/${crypto.randomUUID()}-khasra.jpg`;
  const url = await presignUpload(tempKey, "image/jpeg");
  url.includes("X-Amz-Signature") ? pass("presigned PUT issued") : fail("url is not signed");

  /**
   * The preflight, written out by hand because Node will never send one.
   *
   * Without this check the rest of the script passes against a bucket that no
   * browser can upload into — which is precisely what happened: the temp
   * bucket had no CORS policy, every test here was green, and the only symptom
   * was "something went wrong during the upload" on screen. A browser sends
   * this OPTIONS before any cross-origin PUT and refuses to send the PUT at
   * all unless the answer names the origin.
   */
  for (const origin of UPLOAD_ORIGINS) {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    preflight.headers.get("access-control-allow-origin")
      ? pass(`CORS preflight allows a browser on ${origin}`)
      : fail(
          `CORS preflight refused ${origin} (${preflight.status}) — the server path below ` +
            "will still pass, but a browser could not do this upload. Run `npm run storage:cors`.",
        );
  }

  const put = await fetch(url, {
    method: "PUT",
    body: scan,
    headers: { "Content-Type": "image/jpeg" },
  });
  put.ok
    ? pass(`browser-style direct PUT succeeded (${put.status}) — never touched the app server`)
    : fail(`PUT returned ${put.status}`);

  const src = await getTempObject(tempKey);
  src.body.byteLength === scan.byteLength
    ? pass("server read the upload back intact")
    : fail("temp object differs from what was sent");

  const v = await buildVariants(src.body, src.contentType);
  const keyOriginal = documentKey(projectId, "KHASRA", "original", "khasra.jpg");
  const keyPortal = documentKey(projectId, "KHASRA", "portal", "khasra.jpg");
  await putDocument(keyOriginal, v.original.body, v.original.contentType);
  await putDocument(keyPortal, v.portal.body, v.portal.contentType);
  await deleteTempObject(tempKey);
  pass("variants stored and the temp object cleaned up");

  const portalKb = kb(v.portal.bytes);
  portalKb <= PORTAL_MAX_KB
    ? pass(`portal ${portalKb} KB vs original ${kb(v.original.bytes)} KB`)
    : fail(`portal ${portalKb} KB is over the ${PORTAL_MAX_KB} KB cap`);

  try {
    await getTempObject(tempKey);
    fail("temp object is still retrievable after cleanup");
  } catch {
    pass("temp object no longer retrievable");
  }

  // Checked before cleanup below, which removes both stored variants.
  const dl = await getDocumentObject(keyOriginal);
  dl.body.byteLength > 0
    ? pass("original reads back from storage")
    : fail("original read back empty");

  // Put the bucket back how it was found. Important now that .env points
  // local runs at the live bucket.
  for (const key of [keyOriginal, keyPortal]) await deleteDocumentObject(key);
  pass("test objects removed");

  console.log("");
} catch (err) {
  console.error("\nUpload smoke test failed:\n", err);
  process.exitCode = 1;
}
