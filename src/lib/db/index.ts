import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  DATABASE_CA_CERT,
  DATABASE_POOL_MAX,
  DATABASE_SSL,
  DATABASE_URL,
  isBuild,
  isProduction,
} from "../env";
import * as schema from "./schema";

/**
 * The connection pool.
 *
 * `lib/env` owns whether DATABASE_URL is allowed to be missing — in production
 * it is not, so there is no localhost fallback here any more. A server that
 * silently connected to a Postgres that was not the real one was the worst
 * failure mode this file had.
 */

/**
 * TLS options for postgres.js.
 *
 * `verify-full` checks the certificate chain and that the hostname matches,
 * which is the only mode that actually stops someone answering in the
 * database's place. Where the root certificate comes from depends on who is
 * hosting:
 *
 *   Neon         — signed by a public CA that Node already trusts, so
 *                  DATABASE_CA_CERT is left unset and the system trust store
 *                  does the work. Nothing to download.
 *   RDS / Azure  — signed by the provider's own root, which is not in Node's
 *                  store, so DATABASE_CA_CERT points at their bundle.
 *
 * Making the bundle optional is what allows `verify-full` on Neon; requiring
 * it would push you to the weaker `require` for no security benefit.
 */
function sslConfig() {
  /**
   * `next build` imports this module to collect page data, on a build box that
   * has no database credentials — and `postgres()` does not connect until the
   * first query, so nothing is reached either way. Demanding TLS
   * configuration here would make a correct deployment unbuildable.
   */
  if (isBuild) return false;

  if (DATABASE_SSL === "disable") return false;

  if (DATABASE_SSL === "verify-full") {
    return DATABASE_CA_CERT
      ? { ca: readFileSync(DATABASE_CA_CERT, "utf8"), rejectUnauthorized: true }
      : // No bundle named: verify against Node's own CA set.
        { rejectUnauthorized: true };
  }

  // "require" — encrypted, chain not verified.
  return { rejectUnauthorized: false };
}

/**
 * One pool across hot reloads in development, otherwise every edit opens a new
 * set of connections and Postgres runs out.
 */
const globalForDb = globalThis as unknown as {
  __bhimSql?: ReturnType<typeof postgres>;
};

/**
 * Neon's pooled endpoint needs prepared statements turned off.
 *
 * Detected from the hostname rather than another env var, so it cannot be set
 * wrong: `-pooler` in the host means PgBouncer in transaction mode, which does
 * not reliably support the named prepared statements postgres.js uses by
 * default. Getting this wrong produces intermittent "prepared statement does
 * not exist" errors under concurrency — the worst kind to debug.
 *
 * Which endpoint to use depends on where this runs, and the answer inverts:
 *
 *   A long-lived server (VPS)  — direct endpoint. One process, one pool,
 *                                measured faster, nothing to multiplex.
 *   Serverless (Netlify)       — pooled endpoint. Every function instance
 *                                opens its own connections and they are
 *                                short-lived, which is exactly what PgBouncer
 *                                is for; direct would exhaust the limit.
 */
const isPooled = /-pooler\./.test(DATABASE_URL);

const sql =
  globalForDb.__bhimSql ??
  postgres(DATABASE_URL, {
    max: DATABASE_POOL_MAX,
    ssl: sslConfig(),
    ...(isPooled ? { prepare: false } : {}),
    /**
     * Drop idle connections after a minute.
     *
     * Short on purpose. Neon bills compute time and an open connection keeps
     * the compute awake, so a long-lived Next server holding its pool open
     * overnight would burn the free allowance doing nothing at all. Closing
     * promptly lets the branch suspend; the cost is a reconnect and a
     * wake-up of a few hundred milliseconds on the next query.
     */
    idle_timeout: 60,
    /** Recycle connections every half hour, so none goes stale. */
    max_lifetime: 60 * 30,
    /**
     * Fail a connection attempt in 15s rather than hanging a page render.
     * Generous enough for Neon to wake a suspended branch, short enough that
     * a genuinely wrong host is a fast error instead of a hang.
     */
    connect_timeout: 15,
    /** Lets `pg_stat_activity` name the app that holds a connection. */
    connection: { application_name: "bhim-crm" },
    onnotice: isProduction ? () => {} : undefined,
  });

if (!isProduction) globalForDb.__bhimSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
