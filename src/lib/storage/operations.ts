import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_MANAGE_BUCKETS, S3_SSE } from "../env";
import { BUCKET_DOCUMENTS, BUCKET_TEMP, s3 } from "./client";

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
