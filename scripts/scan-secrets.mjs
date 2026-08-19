#!/usr/bin/env node
/**
 * Blocks obvious credentials from entering git history.
 * Scans the staged diff only, so it stays fast and false-positive-light.
 */
import { execFileSync } from "node:child_process";

const PATTERNS = [
  { name: "private key", re: /-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "hardcoded password assignment", re: /(password|passwd|secret)\s*[:=]\s*["'][^"'$\n]{8,}["']/i },
];

const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

if (staged.includes(".env")) {
  console.error("\n  ✖ .env must never be committed.\n");
  process.exit(1);
}

// Docs, the changelog and tests legitimately mention credential-shaped strings.
const EXEMPT = /^(docs\/|CHANGELOG\.md$|tests\/|\.github\/|scripts\/scan-secrets\.mjs$|\.env\.example$)/;
const files = staged.filter((f) => !EXEMPT.test(f));
if (files.length === 0) process.exit(0);

const diff = execFileSync("git", ["diff", "--cached", "-U0", "--", ...files], { encoding: "utf8" });
const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));

let failed = false;
for (const line of added) {
  for (const { name, re } of PATTERNS) {
    if (re.test(line)) {
      console.error(`  ✖ possible ${name} in staged diff:`);
      console.error(`      ${line.slice(0, 120)}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\n  Move the value into .env (and document it in .env.example).");
  console.error("  Rule: AGENTS.md §5.\n");
  process.exit(1);
}
