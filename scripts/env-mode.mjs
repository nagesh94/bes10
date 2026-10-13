/**
 * Switches .env between the LOCAL and SERVER halves of its one toggle block.
 *
 *   npm run env:local      # Neon        — your laptop
 *   npm run env:server     # local stack — the VPS
 *   node scripts/env-mode.mjs            # just report which is active
 *
 * Why a script rather than "edit the file": the block is 26 lines across two
 * halves, and a half-applied flip is the worst outcome — `docker compose`
 * refuses to start with `required variable POSTGRES_PASSWORD is missing`, or
 * worse, the app quietly runs against the wrong database. Doing it mechanically
 * cannot leave the file in that state.
 *
 * It only ever adds or removes a leading `# ` on `KEY=` lines between the
 * sentinels. Comments, blank lines and everything outside the block are left
 * exactly as they are.
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.env.ENV_FILE ?? ".env";
const MODES = ["local", "server"];

const wanted = process.argv[2];
if (wanted !== undefined && !MODES.includes(wanted)) {
  console.error(`Usage: node scripts/env-mode.mjs [${MODES.join("|")}]`);
  process.exit(1);
}

let text;
try {
  text = readFileSync(FILE, "utf8");
} catch {
  console.error(`Cannot read ${FILE}.`);
  process.exit(1);
}

const lines = text.split(/\r?\n/);

/** Line indices of a `# >>> NAME` / `# <<< NAME` pair, exclusive of the markers. */
function section(name) {
  const start = lines.findIndex((l) => l.trim().startsWith(`# >>> ${name}`));
  const end = lines.findIndex((l) => l.trim().startsWith(`# <<< ${name}`));
  if (start === -1 || end === -1 || end < start) {
    console.error(
      `${FILE} has no "# >>> ${name}" / "# <<< ${name}" block.\n` +
        "The toggle block is missing or was edited by hand — compare against " +
        "docs/DEPLOY-HOSTINGER.md §4.",
    );
    process.exit(1);
  }
  return { start: start + 1, end };
}

const KEY = /^(\s*)(#\s*)?([A-Z][A-Z0-9_]*)=/;

/** The variable names a section would set if it were active. */
function keysIn({ start, end }) {
  const out = [];
  for (let i = start; i < end; i++) {
    const m = KEY.exec(lines[i]);
    if (m) out.push(m[3]);
  }
  return out;
}

function isActive({ start, end }) {
  for (let i = start; i < end; i++) {
    const m = KEY.exec(lines[i]);
    if (m && !m[2]) return true; // a KEY= line with no leading #
  }
  return false;
}

function setActive({ start, end }, active) {
  for (let i = start; i < end; i++) {
    const m = KEY.exec(lines[i]);
    if (!m) continue; // comment or blank — leave alone
    if (active && m[2]) {
      lines[i] = lines[i].replace(/^(\s*)#\s?/, "$1");
    } else if (!active && !m[2]) {
      lines[i] = `# ${lines[i]}`;
    }
  }
}

const local = section("LOCAL");
const server = section("SERVER");

// ── Report only ───────────────────────────────────────────────────────────
if (wanted === undefined) {
  const l = isActive(local);
  const s = isActive(server);
  const mode = l && !s ? "local" : s && !l ? "server" : l && s ? "BOTH (broken)" : "NEITHER (broken)";
  console.log(`${FILE} mode: ${mode}`);
  if (l && s) {
    console.log("  Both halves are active — the later one wins, unpredictably.");
    console.log("  Fix with: npm run env:local  (or env:server)");
    process.exit(1);
  }
  if (!l && !s) {
    console.log("  Neither half is active, so the app has no database at all.");
    console.log("  Fix with: npm run env:local  (or env:server)");
    process.exit(1);
  }
  console.log(`  active keys: ${keysIn(mode === "local" ? local : server).join(", ")}`);
  process.exit(0);
}

// ── Flip ──────────────────────────────────────────────────────────────────
setActive(local, wanted === "local");
setActive(server, wanted === "server");

writeFileSync(FILE, lines.join("\n"), "utf8");

const now = wanted === "local" ? local : server;
console.log(`${FILE} -> ${wanted}`);
console.log(`  active: ${keysIn(now).join(", ")}`);

// The one thing worth checking beyond the comments: these two must agree, or
// Postgres starts with one password and the app connects with another.
const read = (name) => {
  const m = new RegExp(`^${name}="([^"]*)"`, "m").exec(lines.join("\n"));
  return m ? m[1] : undefined;
};
const url = read("DATABASE_URL") ?? "";
const pw = read("POSTGRES_PASSWORD");
if (pw && !url.includes(pw)) {
  console.log("\n  WARNING: POSTGRES_PASSWORD does not appear in DATABASE_URL.");
  console.log("  docker compose would create the database with one password and");
  console.log("  the app would connect with another. Make them match.");
}
