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
 * A short-lived GET URL. Generated per request, after the RBAC check.
 *
 * `downloadFileName` sets `Content-Disposition: attachment`, which is what
 * makes a browser save the file under its real name instead of opening it —
 * omit it for the "Open" action, which should open inline.
 */
export async function presignDownload(
  key: string,
  seconds = 300,
  downloadFileName?: string,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_DOCUMENTS,
      Key: key,
      ...(downloadFileName
        ? { ResponseContentDisposition: `attachment; filename="${downloadFileName.replace(/[\\"]/g, "")}"` }
        : {}),
    }),
    { expiresIn: seconds },
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
