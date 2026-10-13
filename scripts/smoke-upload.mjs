/**
 * Full upload round trip, exactly as the browser does it:
 * presign → direct PUT to storage → server pulls it back → variants → store.
 *
 *   npx tsx scripts/smoke-upload.mjs <projectId>
 */
import sharp from "sharp";
import {
  deleteTempObject,
  ensureBuckets,
  getTempObject,
  presignDownload,
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

  const dl = await fetch(await presignDownload(keyOriginal, 60));
  dl.ok
    ? pass("original downloads through a presigned URL")
    : fail(`download returned ${dl.status}`);

  console.log("");
} catch (err) {
  console.error("\nUpload smoke test failed:\n", err);
  process.exitCode = 1;
}
