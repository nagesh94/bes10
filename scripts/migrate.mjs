/**
 * Applies pending migrations. The production path.
 *
 *   node scripts/migrate.mjs
 *
 * `npm run db:migrate` uses drizzle-kit, which is a dev dependency and so is
 * not installed on a server built with `npm ci --omit=dev`. This script uses
 * drizzle-orm's own migrator instead — a runtime dependency — so the only
 * things it needs on the box are `drizzle-orm`, `postgres` and the `drizzle/`
 * folder of .sql files.
 *
 * It takes an advisory lock first, so two instances deploying at the same
 * moment cannot both try to add the same column. The second one waits, then
 * finds nothing to do.
 */

import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const mode = process.env.DATABASE_SSL ?? "verify-full";
const caPath = process.env.DATABASE_CA_CERT;

/**
 * Mirrors src/lib/db/index.ts: the CA bundle is optional.
 *
 * Neon's certificate comes from a public CA that Node already trusts, so
 * `verify-full` works with nothing on disk. A provider that signs with its own
 * root instead names its bundle in DATABASE_CA_CERT. Requiring it
 * unconditionally made migrations impossible against Neon.
 */
function ssl() {
  if (mode === "disable") return false;
  if (mode === "verify-full") {
    return caPath
      ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: true };
  }
  // "require" — encrypted, chain not verified.
  return { rejectUnauthorized: false };
}

// One connection, not a pool: this process does one thing and exits.
// `onnotice` is silenced because the migrator's CREATE TABLE IF NOT EXISTS
// emits a NOTICE on every run, which reads like an error in a deploy log.
const sql = postgres(url, {
  max: 1,
  ssl: ssl(),
  connect_timeout: 15,
  onnotice: () => {},
});
const db = drizzle(sql);

// An arbitrary but fixed key — any two deploys just have to agree on it.
const LOCK = 8471123;

try {
  const [{ pg_try_advisory_lock: got }] = await sql`select pg_try_advisory_lock(${LOCK})`;
  if (!got) {
    console.log("Another migration is running; waiting for it to finish…");
    await sql`select pg_advisory_lock(${LOCK})`;
  }

  console.log("Applying migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations up to date.");

  await sql`select pg_advisory_unlock(${LOCK})`;
  await sql.end();
} catch (err) {
  console.error("\nMigration failed:\n", err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
