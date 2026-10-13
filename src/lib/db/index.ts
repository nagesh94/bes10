import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://bhim:bhim_local_dev@localhost:5433/bhim_crm";

/**
 * One pool across hot reloads in development, otherwise every edit opens a new
 * set of connections and Postgres runs out.
 */
const globalForDb = globalThis as unknown as {
  __bhimSql?: ReturnType<typeof postgres>;
};

const sql = globalForDb.__bhimSql ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__bhimSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
