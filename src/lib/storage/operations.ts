import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { PUBLIC_URL, S3_MANAGE_BUCKETS, S3_SSE } from "../env";
import { BUCKET_DOCUMENTS, BUCKET_TEMP, s3 } from "./client";

/**
 * The origins a browser is allowed to upload from.
 *
 * Both are in one policy rather than switched per environment, because this
 * project runs on a single .env that is identical on a laptop and on the
 * server: `PUBLIC_URL` is the production URL in both places (see `lib/env`),
 * so localhost has to be named alongside it or local uploads break.
 */
export const UPLOAD_ORIGINS: string[] = Array.from(
  new Set([new URL(PUBLIC_URL).origin, "http://localhost:3000"]),
);

/**
 * What the temp bucket has to allow for the browser to upload into it.
 *
 * PUT only: the browser never reads, lists or deletes here — the server does
 * that with its own credential. Headers are left open because the signed URL,
 * not the header list, is what actually guards the object, and a browser may
 * ask for more than the `Content-Type` this app sends. ETag is exposed so a
 * future retry/resume has something to compare against.
 */
export function uploadCorsRule(): CORSRule {
  return {
    AllowedOrigins: UPLOAD_ORIGINS,
    AllowedMethods: ["PUT"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3000,
  };
}

/** Writes the policy unconditionally. Used by `scripts/set-bucket-cors.mjs`. */
export async function applyUploadCors(): Promise<void> {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_TEMP,
      CORSConfiguration: { CORSRules: [uploadCorsRule()] },
    }),
  );
}

export async function readUploadCors(): Promise<CORSRule[] | null> {
  try {
    const current = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET_TEMP }));
    return current.CORSRules ?? [];
  } catch {
    // NoSuchCORSConfiguration (404) is the normal answer for a bucket that
    // has never had a policy, which is every bucket this app created itself.
    return null;
  }
}

/**
 * The temp bucket accepts a cross-origin PUT from this app's origins.
 *
 * This is the one piece of bucket setup that nothing on the server can notice
 * is missing. The browser uploads straight into the temp bucket, so that
 * bucket — and only that bucket — needs a CORS policy; without one the
 * browser refuses the PUT at the preflight and the file never leaves the
 * phone. Every smoke test still passes, because Node does not enforce CORS.
 *
 * It bit this project exactly that way: the documents bucket was created by
 * hand in the Neon console and carries a policy, while the temp bucket is
 * created by the app over `CreateBucket`, which copies no policy at all. So
 * uploads failed in the browser while every server-side test was green.
 *
 * Unlike versioning (see `ensureBuckets`), this one is genuinely enforced —
 * by the browser rather than by the provider — so setting it is not a call
 * that reports success while protecting nothing.
 */
async function ensureUploadCors(): Promise<void> {
  const rules = await readUploadCors();
  const covered =
    rules !== null &&
    UPLOAD_ORIGINS.every((origin) =>
      rules.some(
        (rule) =>
          (rule.AllowedOrigins ?? []).some((allowed) => allowed === "*" || allowed === origin) &&
          (rule.AllowedMethods ?? []).includes("PUT"),
      ),
    );
  if (covered) return;

  await applyUploadCors();
}

/**
 * The buckets exist.
 *
 * Runs once per process rather than once per upload. Every upload path calls
 * this first, which was free against MinIO but is a wasted round trip against
 * a remote endpoint — and against a least-privilege AWS credential it would
 * fail outright. `S3_MANAGE_BUCKETS` turns it off where the buckets are
 * created by hand instead.
 *
 * Note what is no longer here: nothing enables object versioning.
 *
 * It used to call PutBucketVersioning, which mattered because a re-generated
 * agreement must not destroy the copy that was already printed and signed.
 * Neon stores that setting and does not enforce it — objects always come back
 * with `x-amz-version-id: null` — so the call would have reported success
 * while protecting nothing, which is worse than not making it. Two things
 * make that survivable: every key carries a timestamp, so no object is ever
 * overwritten, and the generated documents are printed and signed on paper.
 * What is genuinely lost is recovery of a superseded file at the three places
 * that delete one on regeneration. Move to a provider with real versioning if
 * that stops being acceptable.
 */
let bootstrapped = false;

export async function ensureBuckets(): Promise<void> {
  if (!S3_MANAGE_BUCKETS) return;
  if (bootstrapped) return;

  for (const bucket of [BUCKET_DOCUMENTS, BUCKET_TEMP]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  // Best-effort: a credential narrow enough to refuse PutBucketCors must not
  // take the whole upload down with it, and the policy may well already be
  // right. But it is said loudly, because the alternative is a technician on
  // a roof reading "something went wrong".
  try {
    await ensureUploadCors();
  } catch (err) {
    console.error(
      `[storage] ${BUCKET_TEMP} has no CORS policy allowing PUT from ` +
        `${UPLOAD_ORIGINS.join(" or ")}, and it could not be set from here. ` +
        "Browser uploads will fail until it is — run `npm run storage:cors`.",
      err,
    );
  }

  bootstrapped = true;
}

/**
 * A short-lived PUT URL so the browser uploads straight to storage.
 *
 * The file never passes through the Next server, which matters for an 8 MB
 * rooftop photo on a phone: no body-size limit, no memory spike, and the
 * upload survives a slow connection without holding a server request open.
 */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_TEMP, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
}

/**
 * Opens a stored object for streaming to the browser.
 *
 * This replaced `presignDownload`. Handing the browser a presigned GET URL
 * was one round trip cheaper, but it published the storage endpoint, the
 * object key and the live access-key id to the address bar of whoever opened
 * the file, and the link went on working for anyone it was forwarded to
 * until it expired. The file now travels through `/api/files/...`, which
 * re-checks the session on every request — see `lib/storage/file-url`.
 *
 * It is a stream and not a Buffer because the same route serves an 8 MB
 * rooftop photo: the body goes out as it arrives rather than sitting in the
 * Node process in one piece.
 */
export async function streamDocumentObject(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
}> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_DOCUMENTS, Key: key }));
  return {
    body: res.Body!.transformToWebStream(),
    contentType: res.ContentType ?? "application/octet-stream",
    contentLength: res.ContentLength ?? null,
  };
}

/**
 * Writes the browser's upload into the temp bucket, streaming.
 *
 * This replaced the presigned PUT the browser used to make itself. That PUT
 * was the only thing in the app that required the *user's own* network to
 * reach the storage host, and some consumer resolvers answer REFUSED for
 * `*.c-3.ap-southeast-1.aws.neon.tech` while serving everything else — so the
 * app looked healthy on those networks and only uploads failed, with the one
 * error `fetch` gives for a request that never left the browser.
 *
 * The body is a stream and `contentLength` is required rather than inferred:
 * S3 needs the length up front, and taking it from the request header is what
 * keeps a 12 MB rooftop photo flowing through this process instead of sitting
 * in it in one piece. The caller has already checked that the length is
 * present, sane and within the cap — this function trusts it, because by the
 * time the bytes are moving there is nothing useful left to do about it.
 */
export async function putTempObject(
  key: string,
  contentType: string,
  body: Readable,
  contentLength: number,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_TEMP,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
  );
}

export async function getTempObject(key: string): Promise<{ body: Buffer; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_TEMP, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

/**
 * Reads a stored document back.
 *
 * Needed by the document generator, which embeds the uploaded customer
 * signature into the forms it produces — the only place this system reads a
 * file back out of storage rather than handing out a presigned URL.
 */
export async function getDocumentObject(
  key: string,
): Promise<{ body: Buffer; contentType: string }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET_DOCUMENTS, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

export async function putDocument(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  // The encryption header is sent only where it is supported: MinIO answers
  // 501 without a KMS, and Neon answers 501 to the bucket-encryption API and
  // encrypts at rest on its own. So S3_SSE is unset for both and set only if
  // this ever points back at real AWS S3.
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_DOCUMENTS,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(S3_SSE ? { ServerSideEncryption: S3_SSE as "AES256" } : {}),
    }),
  );
}

export async function deleteTempObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_TEMP, Key: key }));
  } catch {
    // The temp bucket is disposable; a failed cleanup is not worth failing
    // the upload the user just completed.
  }
}

/**
 * Removes one stored file.
 *
 * This is a permanent delete on Neon, which does not enforce versioning — see
 * `ensureBuckets`. Callers only pass keys they have already superseded.
 */
export async function deleteDocumentObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_DOCUMENTS, Key: key }));
  } catch {
    // A failed cleanup must not block the regeneration that triggered it.
  }
}
