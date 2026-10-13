/**
 * Deletes abandoned uploads from the temp bucket.
 *
 *   node scripts/cleanup-temp.mjs [--hours 24] [--dry-run]
 *
 * Why this exists: on S3 a lifecycle rule did this for free. Neon Object
 * Storage accepts a lifecycle configuration and stores it, but does not
 * enforce it — so without this job, every upload the browser started and
 * never finished stays forever and is billed against the 5 GB allowance.
 *
 * The happy path already cleans up after itself: the server deletes each temp
 * object once it has resized and filed it. What is left here is the residue of
 * a phone that lost signal on a roof, or a tab closed mid-upload.
 *
 * Run it from cron, daily:
 *   15 2 * * *  cd /srv/bhim-crm/current && node scripts/cleanup-temp.mjs >> /var/log/bhim-cleanup.log 2>&1
 *
 * Plain JavaScript with no imports from src/, so it needs neither tsx nor a
 * build — just node, the AWS SDK and the env file.
 */

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const hoursArg = args.indexOf("--hours");
const hours = hoursArg === -1 ? 24 : Number(args[hoursArg + 1]);

if (!Number.isFinite(hours) || hours <= 0) {
  console.error("--hours must be a positive number");
  process.exit(1);
}

const bucket = process.env.S3_BUCKET_TEMP;
if (!bucket) {
  console.error("S3_BUCKET_TEMP is not set.");
  process.exit(1);
}

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  ...(endpoint ? { endpoint } : {}),
  // Neon accepts path-style only; MinIO needs it too.
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? (endpoint ? "true" : "false")) === "true",
  ...(accessKeyId && secretAccessKey
    ? { credentials: { accessKeyId, secretAccessKey } }
    : {}),
  maxAttempts: 3,
  // Several S3-compatible servers answer 501 to the default CRC32 checksum.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const cutoff = Date.now() - hours * 60 * 60 * 1000;

let token;
let scanned = 0;
let deleted = 0;
let bytes = 0;

try {
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );

    const stale = (page.Contents ?? []).filter((o) => {
      scanned++;
      return o.LastModified && o.LastModified.getTime() < cutoff;
    });

    if (stale.length > 0) {
      bytes += stale.reduce((sum, o) => sum + (o.Size ?? 0), 0);

      if (dryRun) {
        for (const o of stale) console.log(`  would delete ${o.Key}`);
      } else {
        // One request per 1000 keys, which is the API's own limit.
        for (let i = 0; i < stale.length; i += 1000) {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: stale.slice(i, i + 1000).map((o) => ({ Key: o.Key })) },
            }),
          );
        }
      }
      deleted += stale.length;
    }

    token = page.NextContinuationToken;
  } while (token);

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(
    `${dryRun ? "[dry run] " : ""}temp cleanup: ${scanned} scanned, ` +
      `${deleted} older than ${hours}h ${dryRun ? "would be" : ""} removed (${mb} MB)`,
  );
} catch (err) {
  console.error("temp cleanup failed:", err);
  process.exit(1);
}
