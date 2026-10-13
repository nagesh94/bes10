/**
 * Creates an employee account, so the money boundary can be tested with a
 * real non-admin session rather than by reasoning about the matrix.
 *
 *   npx tsx scripts/seed-employee.mjs
 */
import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth.ts";
import { db } from "../src/lib/db/index.ts";
// Imported from the table file, not the barrel: the ESM loader cannot follow
// `export *` re-exports across .ts files in a plain .mjs script.
import { user } from "../src/lib/db/schema/auth.ts";

const EMAIL = "priya@bhimenergy.in";
const PASSWORD = "BhimLocal2026!";

const existing = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);

if (existing.length) {
  console.log(`  already exists: ${EMAIL} (role ${existing[0].role})`);
} else {
  await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: "Priya Sharma" },
  });
  await db.update(user).set({ role: "EMPLOYEE", phone: "9876543210" }).where(eq(user.email, EMAIL));
  console.log(`  created ${EMAIL} as EMPLOYEE`);
}

console.log(`\n  ${EMAIL} / ${PASSWORD}\n`);
process.exit(0);
