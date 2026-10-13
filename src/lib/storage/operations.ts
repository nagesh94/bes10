import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET_DOCUMENTS, BUCKET_TEMP, s3 } from "./client";

/**
 * Buckets exist and are versioned.
 *
 * Versioning is on for documents and there is deliberately no lifecycle
 * expiry: a bank or the portal may ask for a file a year later, and a
 * superseded electricity bill still has to be producible.
 */
export async function ensureBuckets(): Promise<void> {
  for (const bucket of [BUCKET_DOCUMENTS, BUCKET_TEMP]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: BUCKET_DOCUMENTS,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
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
  // No ServerSideEncryption header: MinIO answers 501 for SSE-S3 unless a KMS
  // is configured, and at-rest encryption here is the volume's job. On real S3
  // or R2 this is set as a bucket default rather than per request, so the
  // application code stays identical.
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_DOCUMENTS,
      Key: key,
      Body: body,
      ContentType: contentType,
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
 * Removes one stored file. The documents bucket is versioned, so this marks
 * the current version deleted rather than destroying history — but the row
 * and the object stop appearing anywhere a caller is still relying on.
 */
export async function deleteDocumentObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_DOCUMENTS, Key: key }));
  } catch {
    // A failed cleanup must not block the regeneration that triggered it.
  }
}
