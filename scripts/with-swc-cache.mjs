#!/usr/bin/env node
/**
 * Runs a command with SWC's native-binding cache pointed at a project-local
 * folder.
 *
 * Why this exists: on Windows, @swc/core validates the ACL of its default
 * cache root (%LOCALAPPDATA%\swc) and refuses to load if that folder grants
 * write rights to an AppContainer SID — which it commonly does on machines
 * that have ever run a Store app. The failure surfaces as a misleading
 * "Cannot find module './swc.win32-x64-msvc.node'" even though the binary is
 * present and the versions match.
 *
 * SWC_NATIVE_BINDING_CACHE must be an absolute path (its own docs say "0 or an
 * absolute directory", but 0 still validates the default root), so it is
 * resolved here at runtime rather than hard-coded — otherwise one developer's
 * home directory ends up committed in package.json.
 *
 * Harmless on macOS and Linux: it just uses a local cache directory.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const cacheDir = resolve(process.cwd(), ".swc-cache");
mkdirSync(cacheDir, { recursive: true });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/with-swc-cache.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, SWC_NATIVE_BINDING_CACHE: cacheDir },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
