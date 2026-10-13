/**
 * Environment configuration, validated once.
 *
 * The POC leaned on defaults: a missing DATABASE_URL fell back to the Docker
 * Compose Postgres, a missing S3 key fell back to the MinIO root user. That is
 * right for a laptop and wrong for a server — a production box with a typo in
 * its unit file would start cleanly and then quietly write nothing, or worse,
 * reach for a localhost Postgres that is not there.
 *
 * So the rule inverts in production: every secret is required, nothing falls
 * back, and the process refuses to start if one is missing. Development keeps
 * the Compose defaults so `npm run dev` still needs no .env at all.
 */

/**
 * `next build` imports server modules to collect page data, and it runs in CI
 * or on the build box where the real secrets are deliberately absent. Throwing
 * there would make a correct deployment unbuildable, so validation is deferred
 * to the first real read at runtime.
 */
export const isBuild = process.env.NEXT_PHASE === "phase-production-build";

export const isProduction = process.env.NODE_ENV === "production";

/** Required in production, falls back to `dev` elsewhere. */
function need(name: string, dev: string): string {
  const raw = process.env[name];
  if (raw && raw.trim() !== "" && !raw.startsWith("generate-with")) return raw;
  if (isProduction && !isBuild) {
    throw new Error(
      `${name} is not set. Production requires it — add it to .env and restart the service.`,
    );
  }
  return dev;
}

/** Optional everywhere. An empty string counts as absent. */
function opt(name: string): string | undefined {
  const raw = process.env[name];
  return raw && raw.trim() !== "" && !raw.startsWith("generate-with") ? raw : undefined;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = opt(name);
  return raw === undefined ? fallback : raw === "true" || raw === "1";
}

// ── Database ──────────────────────────────────────────────────────────────

export const DATABASE_URL = need(
  "DATABASE_URL",
  "postgresql://bhim:bhim_local_dev@localhost:5433/bhim_crm",
);

/**
 * TLS mode for the database connection.
 *
 * Neon presents a certificate from a public CA that Node already trusts, so
 * `verify-full` needs no bundle on disk — which is the one thing that made
 * RDS and Azure fiddly. DATABASE_CA_CERT stays supported for a managed
 * Postgres that signs with its own root, and is simply left unset for Neon.
 *
 * `require` encrypts without verifying the chain. Prefer `verify-full`.
 */
export const DATABASE_SSL = (opt("DATABASE_SSL") ??
  (isProduction ? "verify-full" : "disable")) as
  | "disable"
  | "require"
  | "verify-full";

export const DATABASE_CA_CERT = opt("DATABASE_CA_CERT");

/**
 * Pool size per Node process.
 *
 * Comfortable against Neon's direct (unpooled) endpoint, which allows far
 * more than this. Divide it if this ever runs behind a process manager with
 * workers, and leave a little room for the migration job.
 */
export const DATABASE_POOL_MAX = Number(opt("DATABASE_POOL_MAX") ?? 10);

// ── Auth ──────────────────────────────────────────────────────────────────

export const AUTH_SECRET = need("AUTH_SECRET", "bhim-local-development-secret-not-for-production");

/**
 * The public URL, and the one value that cannot physically be the same in
 * both places — the browser's origin is localhost in development and the real
 * domain on the server, and Better Auth rejects a sign-in whose Origin does
 * not match.
 *
 * Rather than keep two .env files for this one line, it is derived: the file
 * states the production URL, and development quietly uses localhost. `next
 * dev` sets NODE_ENV=development and `next start` sets production, so the
 * switch happens on its own and there is nothing to edit when deploying.
 */
export const PUBLIC_URL = need("AUTH_URL", "http://localhost:3000");
export const AUTH_URL = isProduction ? PUBLIC_URL : "http://localhost:3000";

if (isProduction && !isBuild && AUTH_SECRET.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters. Generate: openssl rand -base64 32");
}

/**
 * Encrypts the Aadhaar column. Validated here as well as in crypto/field.ts
 * so a bad key fails at boot rather than when a clerk first opens a document —
 * and losing this key makes every stored Aadhaar number unreadable, so it
 * belongs in Secrets Manager, not only in the unit file.
 */
export const FIELD_ENCRYPTION_KEY = need("FIELD_ENCRYPTION_KEY", "");

if (isProduction && !isBuild) {
  if (Buffer.from(FIELD_ENCRYPTION_KEY, "base64").length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must decode to 32 bytes. Generate: openssl rand -base64 32",
    );
  }
}

// ── Object storage (S3-compatible: Neon Object Storage) ───────────────────

/**
 * Neon Object Storage speaks the S3 API, so this stays the AWS SDK.
 *
 * The endpoint is per Neon *branch*, not per region — buckets belong to a
 * branch and are copy-on-write, so a dev branch inherits production's objects
 * without duplicating them. Read it off the Storage page of the branch you
 * are pointing at. MinIO uses this same variable locally.
 */
export const S3_ENDPOINT = opt("S3_ENDPOINT");

/**
 * Neon ignores the region but the SDK refuses to sign without one, so this
 * is a placeholder there rather than a real location.
 */
export const S3_REGION = need("S3_REGION", "us-east-1");

export const S3_BUCKET_DOCUMENTS = need("S3_BUCKET_DOCUMENTS", "bhim-documents");
export const S3_BUCKET_TEMP = need("S3_BUCKET_TEMP", "bhim-temp");

/**
 * A Neon credential, which maps onto an S3 access key pair.
 *
 * Unlike the EC2 plan this replaced, there is no instance role to fall back
 * on — Neon has no equivalent, so production does hold a key. Keep it in the
 * root-owned env file and rotate it from the Neon console if it leaks.
 */
export const S3_ACCESS_KEY_ID = opt("S3_ACCESS_KEY_ID");
export const S3_SECRET_ACCESS_KEY = opt("S3_SECRET_ACCESS_KEY");

if (isProduction && !isBuild && !(S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY)) {
  throw new Error(
    "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are not set. Create a credential " +
      "in the Neon console (Storage -> Credentials) and add both to the env file.",
  );
}

/**
 * Neon accepts path-style addressing only, and so does MinIO. Following the
 * endpoint rather than being set by hand means neither can be got wrong:
 * a custom endpoint implies path-style.
 */
export const S3_FORCE_PATH_STYLE = flag("S3_FORCE_PATH_STYLE", S3_ENDPOINT !== undefined);

/**
 * Whether the app may create its own buckets.
 *
 * True by default here, unlike the AWS plan. Neon supports CreateBucket and
 * HeadBucket over the S3 API and the credential is account-scoped rather than
 * narrowed by an IAM policy, so the bootstrap genuinely works. It still runs
 * once per process rather than once per upload.
 */
export const S3_MANAGE_BUCKETS = flag("S3_MANAGE_BUCKETS", true);

/**
 * Server-side encryption header. Left unset for Neon, which answers 501 to
 * PutBucketEncryption and encrypts at rest on its own; set it to "AES256"
 * only if this ever points back at real AWS S3.
 */
export const S3_SSE = opt("S3_SSE");

// ── Documents ─────────────────────────────────────────────────────────────

export const GOTENBERG_URL = need("GOTENBERG_URL", "http://localhost:3001");
export const PORTAL_MAX_FILE_KB = Number(opt("PORTAL_MAX_FILE_KB") ?? 2048);

// ── App ───────────────────────────────────────────────────────────────────

export const APP_URL = opt("NEXT_PUBLIC_APP_URL") ?? AUTH_URL;
