#!/usr/bin/env node
/** Points git at the repo-tracked hooks in .githooks/. Run by `npm install`. */
import { execFileSync } from "node:child_process";
import { existsSync, chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";

if (process.env.CI) {
  console.log("[hooks] CI detected - skipping hook installation.");
  process.exit(0);
}
if (!existsSync(".git")) {
  console.log("[hooks] not a git working tree - skipping hook installation.");
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
  for (const file of readdirSync(".githooks")) {
    try {
      chmodSync(join(".githooks", file), 0o755);
    } catch {
      // Windows / restricted filesystems: git runs the hook through sh anyway.
    }
  }
  console.log("[hooks] core.hooksPath -> .githooks");
} catch (err) {
  console.warn(`[hooks] could not install hooks: ${err.message}`);
}
