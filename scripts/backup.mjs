/**
 * Off-site backup: the database, and the stored documents.
 *
 *   node --env-file-if-exists=.env scripts/backup.mjs [--db-only|--files-only] [--dry-run]
 *
 * Running everything on one VPS buys speed and keeps customer documents in
 * India, but it means a single disk holds the only copy of both the database
 * and every scanned Aadhaar card, electricity bill and signed agreement. If
 * that disk goes, the business loses its records. Hostinger's own snapshots
 * help, but a backup you cannot restore from somewhere else is not a backup.
 *
 * So this pushes both to a second provider. The free Neon bucket is an ideal
 * destination: 5 GB, a different company, a different country, and already
 * paid for.
 *
 * It is deliberately not clever. A gzipped pg_dump restores with psql on any
 * machine with Postgres, and the documents are copied as plain objects under
 * the same keys, so a restore is a copy back rather than a bespoke tool.
 *
 * Install as a daily cron job (see docs/DEPLOY-HOSTINGER.md).
 */

import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dbOnly = args.includes("--db-only");
const filesOnly = args.includes("--files-only");

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const CONTAINER = process.env.POSTGRES_CONTAINER ?? "bhim-postgres";
const PG_USER = process.env.POSTGRES_USER ?? "bhim";
const PG_DB = process.env.POSTGRES_DB ?? "bhim_crm";

const DEST_BUCKET = process.env.BACKUP_S3_BUCKET;
if (!DEST_BUCKET) {
  console.error(
    "BACKUP_S3_BUCKET is not set. Point it at an off-site bucket — the free Neon\n" +
      "bucket is a good choice — along with BACKUP_S3_ENDPOINT, BACKUP_S3_REGION,\n" +
      "BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY.",
  );
  process.exit(1);
}

/** The off-site destination. Deliberately a different account from the app's. */
const dest = new S3Client({
  region: process.env.BACKUP_S3_REGION ?? "us-east-1",
  ...(process.env.BACKUP_S3_ENDPOINT ? { endpoint: process.env.BACKUP_S3_ENDPOINT } : {}),
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? "",
  },
  maxAttempts: 3,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/** Where the app's own documents live — local MinIO in this deployment. */
const source = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  maxAttempts: 3,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

// ── Database ──────────────────────────────────────────────────────────────

async function backupDatabase() {
  const local = path.join(tmpdir(), `bhim-${stamp}.sql.gz`);
  const key = `db/bhim-${stamp}.sql.gz`;

  console.log(`  dumping ${PG_DB} from container ${CONTAINER}…`);

  if (dryRun) {
    console.log(`  [dry run] would dump and upload ${key}`);
    return;
  }

  // Through docker exec rather than a local pg_dump, so the host needs no
  // postgres-client installed and the dump always matches the server version.
  const dump = spawn("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    PG_USER,
    "-d",
    PG_DB,
    "--no-owner",
    "--no-privileges",
  ]);

  let stderr = "";
  dump.stderr.on("data", (d) => (stderr += d.toString()));

  // Streamed and gzipped on the way to disk, so a large database never has to
  // fit in memory.
  await pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(local));

  const code = await new Promise((resolve) => dump.on("close", resolve));
  if (code !== 0) {
    throw new Error(`pg_dump exited ${code}: ${stderr.trim()}`);
  }

  const size = statSync(local).size;
  if (size < 1024) {
    throw new Error(`dump is only ${size} bytes — refusing to upload a probably-empty backup`);
  }

  await dest.send(
    new PutObjectCommand({
      Bucket: DEST_BUCKET,
      Key: key,
      Body: createReadStream(local),
      ContentLength: size,
      ContentType: "application/gzip",
    }),
  );
  unlinkSync(local);

  console.log(`  uploaded ${key} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}

/** Drops dumps older than the retention window. Never touches documents. */
async function pruneDatabaseBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400_000;
  const listed = await dest.send(new ListObjectsV2Command({ Bucket: DEST_BUCKET, Prefix: "db/" }));
  const old = (listed.Contents ?? []).filter(
    (o) => o.LastModified && o.LastModified.getTime() < cutoff,
  );

  if (old.length === 0) {
    console.log(`  nothing older than ${RETENTION_DAYS} days to prune`);
    return;
  }
  if (dryRun) {
    console.log(`  [dry run] would prune ${old.length} dumps`);
    return;
  }
  await dest.send(
    new DeleteObjectsCommand({
      Bucket: DEST_BUCKET,
      Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
    }),
  );
  console.log(`  pruned ${old.length} dumps older than ${RETENTION_DAYS} days`);
}

// ── Documents ─────────────────────────────────────────────────────────────

async function listAll(client, bucket, prefix = undefined) {
  const keys = new Map();
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, Prefix: prefix }),
    );
    for (const o of page.Contents ?? []) keys.set(o.Key, o.Size ?? 0);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

/**
 * Mirrors new documents to the off-site bucket.
 *
 * Incremental and additive: compares keys and sizes, copies what is missing,
 * and never deletes. Document keys carry a timestamp so they are never
 * rewritten, which is what makes a key-and-size comparison sufficient — there
 * is no such thing as a changed object here, only new ones.
 */
async function backupDocuments() {
  const srcBucket = process.env.S3_BUCKET_DOCUMENTS;
  if (!srcBucket) {
    console.log("  S3_BUCKET_DOCUMENTS is not set; skipping documents");
    return;
  }

  const [have, already] = await Promise.all([
    listAll(source, srcBucket),
    listAll(dest, DEST_BUCKET, "documents/"),
  ]);

  const missing = [...have.entries()].filter(
    ([key, size]) => already.get(`documents/${key}`) !== size,
  );

  if (missing.length === 0) {
    console.log(`  documents up to date (${have.size} objects)`);
    return;
  }
  if (dryRun) {
    const mb = missing.reduce((s, [, size]) => s + size, 0) / 1024 / 1024;
    console.log(`  [dry run] would copy ${missing.length} objects (${mb.toFixed(1)} MB)`);
    return;
  }

  let copied = 0;
  let bytes = 0;
  for (const [key, size] of missing) {
    const obj = await source.send(new GetObjectCommand({ Bucket: srcBucket, Key: key }));
    const body = Buffer.from(await obj.Body.transformToByteArray());
    await dest.send(
      new PutObjectCommand({
        Bucket: DEST_BUCKET,
        Key: `documents/${key}`,
        Body: body,
        ContentType: obj.ContentType ?? "application/octet-stream",
      }),
    );
    copied++;
    bytes += size;
  }
  console.log(`  copied ${copied} new documents (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

// ── Run ───────────────────────────────────────────────────────────────────

const started = Date.now();
console.log(`\nBackup -> ${DEST_BUCKET}${dryRun ? " [dry run]" : ""}\n`);

try {
  if (!filesOnly) {
    await backupDatabase();
    await pruneDatabaseBackups();
  }
  if (!dbOnly) {
    await backupDocuments();
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
} catch (err) {
  console.error("\nBackup FAILED:", err.message, "\n");
  process.exit(1);
}
