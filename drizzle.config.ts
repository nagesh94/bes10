import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://bhim:bhim_local_dev@localhost:5433/bhim_crm",
  },
  verbose: true,
  strict: true,
});
