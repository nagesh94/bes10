/**
 * Puts the CORS policy on the temp bucket, then proves a browser could use it.
 *
 *   npm run storage:cors            # apply, then verify
 *   npm run storage:cors -- --check # verify only, change nothing
 *
 * Why this exists: the browser uploads straight into the temp bucket through a
 * presigned PUT, so that bucket needs a CORS policy naming this app's origins.
 * Nothing on the server can tell that it is missing — Node does not enforce
 * CORS, so every smoke test passes against a bucket no browser can upload to.
 * That is exactly how it failed here: the documents bucket was created by hand
 * in the Neon console and carries a policy, while the temp bucket is created by
 * the app over `CreateBucket`, which copies none.
 *
 * The app also sets this on first use (`ensureBuckets`), but best-effort and
 * only once per process, so this script is what to reach for when uploads are
 * failing or a bucket has just been replaced.
 *
 * The verification is the part worth watching: it issues a real presigned PUT
 * and sends the same preflight a browser would, which is the only check that
 * actually tracks what a phone on a roof will experience.
 */
import {
  UPLOAD_ORIGINS,
  applyUploadCors,
  presignUpload,
  readUploadCors,
  uploadCorsRule,
} from "../src/lib/storage/operations.ts";
import { BUCKET_TEMP, S3_ENDPOINT } from "../src/lib/storage/client.ts";

const checkOnly = process.argv.includes("--check");

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  process.exitCode = 1;
};

console.log(`\n  bucket:  ${BUCKET_TEMP}`);
console.log(`  endpoint: ${S3_ENDPOINT ?? "(AWS default)"}`);
console.log(`  origins:  ${UPLOAD_ORIGINS.join("  ")}\n`);

const before = await readUploadCors();
console.log(`  current policy: ${before === null ? "none" : JSON.stringify(before)}\n`);

if (!checkOnly) {
  try {
    await applyUploadCors();
    pass(`policy written: ${JSON.stringify(uploadCorsRule())}`);
  } catch (err) {
    fail(`could not write the policy: ${err.name} — ${err.message}`);
    console.error(
      "\n  If the endpoint answers 501 the provider does not implement the CORS\n" +
        "  API, and the policy has to be set in its console instead.\n",
    );
    process.exit(1);
  }

  const after = await readUploadCors();
  after === null
    ? fail("the policy did not read back — the write was accepted but stored nothing")
    : pass(`reads back: ${JSON.stringify(after)}`);
}

// The browser's half. A signed PUT URL, then the preflight a browser sends
// before it: OPTIONS carrying the origin and the method it intends to use.
// Only an `Access-Control-Allow-Origin` in the answer lets the real PUT go.
const probeKey = `incoming/cors-check/${crypto.randomUUID()}-probe.bin`;
const url = await presignUpload(probeKey, "image/jpeg");

for (const origin of UPLOAD_ORIGINS) {
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const allowed = preflight.headers.get("access-control-allow-origin");

  allowed
    ? pass(`a browser on ${origin} may upload (allow-origin: ${allowed})`)
    : fail(
        `${origin} is still refused — preflight answered ${preflight.status} with no ` +
          "allow-origin header, so uploads from there will fail in the browser",
      );
}

// Nothing was uploaded: a preflight creates no object, so there is nothing to
// clean up and no bytes billed.
console.log("");
