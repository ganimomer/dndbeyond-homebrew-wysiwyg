// @ts-nocheck
/**
 * Cross-browser build.
 *
 * The whole extension is shared TypeScript in `src/`. The only per-browser
 * difference lives in `targets/<browser>/manifest.json` (the "thin layer").
 * This script bundles the shared entry points with esbuild and drops the
 * right manifest next to them in `dist/<browser>/`.
 *
 *   node build.mjs --browser firefox [--watch]
 *   node build.mjs --browser chrome  [--watch]
 */
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const browser = valueOf("--browser") ?? "firefox";
const watch = args.includes("--watch");

if (!["firefox", "chrome"].includes(browser)) {
  console.error(`Unknown --browser "${browser}". Use "firefox" or "chrome".`);
  process.exit(1);
}

const outdir = resolve(root, "dist", browser);

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Shared entry points. Same source for every browser. */
const entryPoints = {
  content: resolve(root, "src/content/index.ts"),
  background: resolve(root, "src/background/index.ts"),
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints,
  outdir,
  bundle: true,
  format: "iife",
  target: ["firefox115", "chrome114"],
  // Bundling Lexical + lit-html makes the content script large; minify release
  // builds so the shipped size is the ~290KB minified figure, not ~900KB. Dev
  // builds stay readable for debugging in the page.
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  define: {
    __BROWSER__: JSON.stringify(browser),
  },
  loader: {
    // CSS is imported as a string and injected into the page/shadow root,
    // so the whole content script stays a single self-contained file.
    ".css": "text",
  },
};

async function copyStatic() {
  await cp(
    resolve(root, "targets", browser, "manifest.json"),
    resolve(outdir, "manifest.json"),
  );
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    await copyStatic();
    console.log(`[${browser}] watching for changes…`);
  } else {
    await esbuild.build(options);
    await copyStatic();
    console.log(`[${browser}] built → dist/${browser}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
