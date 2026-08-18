// @ts-nocheck
/**
 * Test runner. The project has no framework and ships as bundled TypeScript, so
 * tests follow suit: every `src/**\/*.test.ts` is bundled with esbuild (same
 * resolver/loader as the real build) into a temp dir and handed to Node's
 * built-in `node:test`. Keeps tests dependency-free and identical to how the
 * extension actually compiles.
 *
 *   node scripts/test.mjs
 */
import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { globSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const files = globSync("src/**/*.test.ts");
if (files.length === 0) {
  console.log("No test files found (src/**/*.test.ts).");
  process.exit(0);
}

// Emit under node_modules so the externalized packages (lexical, jsdom…) resolve
// from the project's own node_modules at runtime.
const outdir = resolve(root, "node_modules/.cache/mb-tests");
rmSync(outdir, { recursive: true, force: true });

await esbuild.build({
  entryPoints: files,
  outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  // Bundle our own `.ts` (resolving the `.js` specifiers), but load npm packages
  // (lexical, jsdom…) from node_modules at runtime rather than inlining them.
  packages: "external",
  loader: { ".css": "text" },
  logLevel: "error",
});

// esbuild mirrors src/ subdirs under outdir; collect every emitted bundle and
// hand the concrete files to node:test (an empty list would make node --test
// fall back to discovery and re-run this very script).
const bundled = globSync(resolve(outdir, "**/*.js"));
if (bundled.length === 0) {
  console.error("No test bundles were emitted.");
  process.exit(1);
}
execFileSync("node", ["--test", ...bundled], { stdio: "inherit" });
