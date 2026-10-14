/**
 * Storage smoke test, against whatever S3-compatible storage .env points at —
 * MinIO locally, or Neon Object Storage.
 *
 * Builds a large synthetic photo, runs it through the variant pipeline, puts
 * all three variants in the bucket, reads one back out of storage, and
 * checks the portal copy actually came in under the cap.
 *
 * It writes real objects, so it deletes them again at the end. With a single
 * shared .env this runs against the live bucket, and 20 MB of leftovers per
 * run adds up fast against a free tier.
 *
 *   npm run smoke:storage
 */
import sharp from "sharp";
import { buildVariants, stampGeo } from "../src/lib/storage/variants.ts";
import { PORTAL_MAX_KB, S3_ENDPOINT, documentKey } from "../src/lib/storage/client.ts";
import {
  deleteDocumentObject,
  ensureBuckets,
  getDocumentObject,
  putDocument,
} from "../src/lib/storage/operations.ts";

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  process.exitCode = 1;
};
const kb = (n) => `${Math.round(n / 1024)} KB`;

try {
  await ensureBuckets();
  pass("buckets exist and documents is versioned");

  // A 4000×3000 photo with real detail — a flat colour would compress to
  // nothing and prove the pipeline works when it would not.
  const noise = await sharp({
    create: { width: 4000, height: 3000, channels: 3, noise: { type: "gaussian", mean: 140, sigma: 70 } },
  })
    .jpeg({ quality: 96 })
    .toBuffer();

  console.log(`\n  source photo: ${kb(noise.byteLength)}\n`);
  noise.byteLength > 1_000_000
    ? pass("source is over 1 MB, like a real phone photo")
    : fail(`source only ${kb(noise.byteLength)} — not a fair test`);

  const variants = await buildVariants(noise, "image/jpeg");

  variants.original.bytes === noise.byteLength
    ? pass(`original untouched at ${kb(variants.original.bytes)} — this is what prints`)
    : fail("original was modified");

  if (!variants.portal) fail("no portal variant was produced");
  else {
    const portalKb = Math.round(variants.portal.bytes / 1024);
    portalKb <= PORTAL_MAX_KB
      ? pass(`portal variant ${portalKb} KB, under the ${PORTAL_MAX_KB} KB cap`)
      : fail(`portal variant ${portalKb} KB exceeds the ${PORTAL_MAX_KB} KB cap`);
    variants.portal.bytes < variants.original.bytes / 5
      ? pass("portal copy is a fraction of the original")
      : fail("portal copy barely shrank");
  }

  variants.thumb ? pass(`thumb ${kb(variants.thumb.bytes)}`) : fail("no thumb");

  // A PDF under the cap must pass through untouched. It does still get a
  // portal variant, but that variant IS the original object rather than a
  // second copy — `portalSameAsOriginal` is how the caller knows to upload one
  // file and point both keys at it. This assertion used to demand
  // `portal === null`, which was the behaviour before that flag existed, so it
  // failed against correct code.
  const fakePdf = Buffer.from("%PDF-1.7\n% test\n");
  const pdfVariants = await buildVariants(fakePdf, "application/pdf");
  pdfVariants.portalSameAsOriginal === true &&
  pdfVariants.thumb === null &&
  pdfVariants.original.bytes === fakePdf.byteLength &&
  pdfVariants.portal?.bytes === fakePdf.byteLength
    ? pass("a small PDF passes through, portal reusing the original object")
    : fail("PDF was altered");

  // Put all three in the bucket and read one back.
  const projectId = "prj_smoke";
  const keyO = documentKey(projectId, "ELECTRICITY_BILL", "original", "bill.jpg");
  const keyP = documentKey(projectId, "ELECTRICITY_BILL", "portal", "bill.jpg");
  const keyT = documentKey(projectId, "ELECTRICITY_BILL", "thumb", "bill.jpg");

  await putDocument(keyO, variants.original.body, "image/jpeg");
  await putDocument(keyP, variants.portal.body, "image/jpeg");
  await putDocument(keyT, variants.thumb.body, "image/jpeg");
  pass(`all three variants written to ${S3_ENDPOINT ?? "S3"}`);

  const back = (await getDocumentObject(keyP)).body;
  back.byteLength === variants.portal.bytes
    ? pass("portal variant reads back byte-for-byte")
    : fail(`read back ${back.byteLength} bytes`);

  // Aadhaar goes under its own prefix so a bucket policy can gate it.
  documentKey(projectId, "AADHAAR", "original", "a.jpg").startsWith("restricted/")
    ? pass("Aadhaar keys sit under restricted/")
    : fail("Aadhaar key is not restricted");

  // Geo stamp.
  const stamped = await stampGeo(variants.portal.body, {
    latitude: 21.8840185,
    longitude: 77.9016424,
    capturedAt: new Date("2026-09-28T11:42:00"),
  });
  const stampedMeta = await sharp(stamped).metadata();
  stamped.byteLength > 0 && stampedMeta.width
    ? pass(`geo stamp burned in (${stampedMeta.width}×${stampedMeta.height})`)
    : fail("geo stamp failed");

  // Put the bucket back how it was found. Important now that .env points
  // local runs at the live bucket.
  for (const key of [keyO, keyP, keyT]) await deleteDocumentObject(key);
  pass("test objects removed");

  console.log("");
} catch (err) {
  console.error("\nStorage smoke test failed:\n", err);
  process.exitCode = 1;
}
