// @ts-nocheck
/**
 * Cross-browser build.
 *
 * The whole extension is shared TypeScript in `src/`. The only per-browser
 * difference lives in `targets/<browser>/manifest.json` (the "thin layer").
 * This script bundles the shared entry points with esbuild and drops the
 * right manifest next to them in `dist/<browser>/`.
 *
 * The manifests in `targets/` carry no `version` — the one in `dist/` is
 * stamped here, so there is a single answer to what version this is. A release
 * passes `--version` (computed from the git tag; see
 * .github/workflows/release.yml) and everything else falls back to
 * package.json, which keeps `npm run dev:*` working unchanged.
 *
 *   node build.mjs --browser firefox [--watch] [--version X.Y.Z]
 *   node build.mjs --browser chrome  [--watch] [--version X.Y.Z]
 */
import * as esbuild from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  // Preact's automatic JSX runtime — same setting as tsconfig.json, so what
  // typechecks is what ships.
  jsx: "automatic",
  jsxImportSource: "preact",
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

/**
 * The version this build stamps into the manifest.
 *
 * Both stores parse a manifest version as one to four dot-separated integers,
 * so a semver pre-release tag ("1.0.0-rc.1") is not a thing either of them will
 * install. Rejecting it here means a release fails at the build rather than at
 * the store.
 */
async function resolveVersion() {
  const explicit = valueOf("--version");
  if (explicit === undefined) {
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    return pkg.version;
  }
  if (!/^\d+(\.\d+){0,3}$/.test(explicit)) {
    console.error(
      `--version "${explicit}" is not a manifest version: one to four ` +
        `dot-separated integers, no pre-release suffix.`,
    );
    process.exit(1);
  }
  return explicit;
}

async function copyStatic(version) {
  const manifest = JSON.parse(
    await readFile(resolve(root, "targets", browser, "manifest.json"), "utf8"),
  );
  // Stamped, never copied: `targets/` deliberately holds no version, so there
  // is nothing here that can drift out of step with the release.
  manifest.version = version;
  await writeFile(
    resolve(outdir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function run() {
  const version = await resolveVersion();

  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    await copyStatic(version);
    console.log(`[${browser}] watching for changes…`);
  } else {
    await esbuild.build(options);
    await copyStatic(version);
    console.log(`[${browser}] built ${version} → dist/${browser}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
