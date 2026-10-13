import { S3Client } from "@aws-sdk/client-s3";
import {
  PORTAL_MAX_FILE_KB,
  S3_ACCESS_KEY_ID,
  S3_BUCKET_DOCUMENTS,
  S3_BUCKET_TEMP,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
  isProduction,
} from "../env";

/**
 * One S3 client, pointed at whatever endpoint the environment names.
 *
 * MinIO locally, Neon Object Storage in production. Both speak the S3 API, so
 * moving between them is configuration rather than a code change — which is
 * the whole reason the POC ran an S3-compatible server instead of writing to
 * disk, and the reason Neon's bucket feature needed no rewrite.
 */

export { S3_BUCKET_DOCUMENTS as BUCKET_DOCUMENTS, S3_BUCKET_TEMP as BUCKET_TEMP, S3_ENDPOINT };

/**
 * Government portals cap uploads; the portal variant is squeezed under this.
 *
 * 2 MB. The default has to match `.env`, because a deployment that
 * forgets the variable would otherwise squeeze every portal copy to a
 * different size than the one tested.
 */
export const PORTAL_MAX_KB = PORTAL_MAX_FILE_KB;

/**
 * Credentials, from a Neon credential or MinIO's root user.
 *
 * Left undefined when neither is set, which makes the SDK walk its own
 * provider chain — useful if this ever points back at AWS with an instance
 * role. Neon has no such mechanism, so production does carry a key; `lib/env`
 * refuses to start without one.
 */
const credentials =
  S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
    ? { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    : undefined;

const globalForS3 = globalThis as unknown as { __bhimS3?: S3Client };

export const s3 =
  globalForS3.__bhimS3 ??
  new S3Client({
    region: S3_REGION,
    // Absent only if this ever points at real AWS, which builds its own
    // regional endpoint. Neon and MinIO both name one.
    ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
    // Neon accepts path-style addressing only. MinIO needs it too.
    forcePathStyle: S3_FORCE_PATH_STYLE,
    ...(credentials ? { credentials } : {}),
    /**
     * Three attempts with the SDK's adaptive backoff. Neon documents a
     * `503 SlowDown` under load and asks clients to back off, and a retried
     * rooftop photo upload is much better than an error in front of a
     * technician standing on a roof.
     */
    maxAttempts: 3,
    // The SDK adds a CRC32 checksum to every request by default. Real S3
    // accepts it; several S3-compatible servers answer 501 NotImplemented.
    // Sending it only when the operation requires it keeps both happy.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

if (!isProduction) globalForS3.__bhimS3 = s3;

/**
 * Keys are grouped by project so a whole project's files can be listed,
 * copied or audited as one prefix. Aadhaar lives under its own prefix so a
 * bucket policy can restrict it separately.
 *
 * The timestamp matters more than it looks: every key is unique, so nothing
 * is ever overwritten. That is what makes the lack of real object versioning
 * on Neon survivable — see the note in `operations.ts`.
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
