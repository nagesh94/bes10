import { S3Client } from "@aws-sdk/client-s3";

/**
 * One S3 client, pointed at whatever endpoint the environment names.
 *
 * MinIO locally, S3 or Cloudflare R2 later — the API is identical, so moving
 * is four environment variables rather than a code change. That is the whole
 * reason the POC runs an S3-compatible server instead of writing to disk.
 */

export const S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";
export const BUCKET_DOCUMENTS = process.env.S3_BUCKET_DOCUMENTS ?? "bhim-documents";
export const BUCKET_TEMP = process.env.S3_BUCKET_TEMP ?? "bhim-temp";

/**
 * Government portals cap uploads; the portal variant is squeezed under this.
 *
 * 2 MB. The default has to match `.env.example`, because a deployment that
 * forgets the variable would otherwise squeeze every portal copy to a
 * different size than the one tested.
 */
export const PORTAL_MAX_KB = Number(process.env.PORTAL_MAX_FILE_KB ?? 2048);

const globalForS3 = globalThis as unknown as { __bhimS3?: S3Client };

export const s3 =
  globalForS3.__bhimS3 ??
  new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: S3_ENDPOINT,
    // MinIO needs path-style addressing; AWS S3 does not.
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "bhim_minio",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "bhim_minio_local_dev",
    },
    // The SDK now adds a CRC32 checksum to every request by default. Real S3
    // accepts it; several S3-compatible servers answer 501 NotImplemented.
    // Sending it only when the operation requires it keeps both happy.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

if (process.env.NODE_ENV !== "production") globalForS3.__bhimS3 = s3;

/**
 * Keys are grouped by project so a whole project's files can be listed,
 * copied or audited as one prefix. Aadhaar lives under its own prefix so a
 * bucket policy can restrict it separately.
 */
export function documentKey(
  projectId: string,
  docType: string,
  variant: "original" | "portal" | "thumb",
  fileName: string,
): string {
  const restricted = docType === "AADHAAR" ? "restricted/" : "";
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `${restricted}projects/${projectId}/${docType}/${variant}/${Date.now()}-${safe}`;
}

/**
 * Quotations live under their own prefix rather than a project's.
 *
 * Half of them are raised for a walk-in who has no project yet, and a
 * quotation that later gets linked to one must not have to move objects to
 * do it. The number is in the key so the bucket can be read by eye.
 */
export function quotationKey(number: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `quotations/${number}/${Date.now()}-${safe}`;
}

/**
 * Agreements live under their own prefix, as quotations do.
 *
 * Half of them are drawn up for a walk-in who has no project yet, and one
 * that is later linked to a project must not have to move objects to do it.
 * There is no number series, so the key carries the id.
 */
export function agreementKey(agreementId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  return `agreements/${agreementId}/${Date.now()}-${safe}`;
}
