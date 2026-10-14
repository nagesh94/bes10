/**
 * Creates an executive account, so the money boundary can be tested with a
 * real non-admin session rather than by reasoning about the matrix.
 *
 * Pass extra roles to check a combination — an account that is both an
 * executive and an installer should reach the pipeline AND its own job list:
 *
 *   npx tsx scripts/seed-employee.mjs
 *   npx tsx scripts/seed-employee.mjs INSTALLER
 */
import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth.ts";
import { db } from "../src/lib/db/index.ts";
// Imported from the table file, not the barrel: the ESM loader cannot follow
// `export *` re-exports across .ts files in a plain .mjs script.
import { user } from "../src/lib/db/schema/auth.ts";

const EMAIL = "priya@bhimenergy.in";
const PASSWORD = "BhimLocal2026!";
const ROLES = ["EMPLOYEE", ...process.argv.slice(2).map((r) => r.toUpperCase())];

const existing = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);

if (existing.length) {
  await db.update(user).set({ roles: ROLES }).where(eq(user.email, EMAIL));
  console.log(`  already exists: ${EMAIL} (roles set to ${ROLES.join(", ")})`);
} else {
  await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: "Priya Sharma" },
  });
  await db.update(user).set({ roles: ROLES, phone: "9876543210" }).where(eq(user.email, EMAIL));
  console.log(`  created ${EMAIL} as ${ROLES.join(", ")}`);
}

console.log(`\n  ${EMAIL} / ${PASSWORD}\n`);
process.exit(0);
