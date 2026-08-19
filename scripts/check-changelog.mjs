#!/usr/bin/env node
/** A source change must carry a CHANGELOG.md entry (AGENTS.md rule 4). */
import { execFileSync } from "node:child_process";

const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

if (staged.some((f) => /^(src|scripts)\/.*\.(ts|mjs)$/.test(f)) && !staged.includes("CHANGELOG.md")) {
  console.error("\n  ✖ Source changed but CHANGELOG.md was not updated.");
  console.error("    Add an entry under '## [Unreleased]'. Rule: AGENTS.md §4.\n");
  process.exit(1);
}
