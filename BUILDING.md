# Building Microbrewery from source

This is the file an add-on reviewer wants: what the shipped files are built
from, and how to rebuild them byte-for-byte. Everything here also works for
anyone who just wants to run it locally.

## Why a source archive exists at all

The extension is TypeScript in `src/`, bundled and minified into a single
`content.js` by [esbuild](https://esbuild.github.io). Mozilla requires source
for anything bundled or minified, so every release carries
`microbrewery-source-<version>.zip` alongside the installable archives. It is
the tracked git tree — no `node_modules`, no build output.

## Environment

| | |
|---|---|
| OS | Any. Built and tested on macOS and Ubuntu; nothing is platform-specific |
| Node | **22 or newer** (`.nvmrc` pins 22; `nvm use` picks it up) |
| npm | 10 or newer, whatever ships with that Node |

Node 22 is a real floor, not a preference: `scripts/test.mjs` globs with
`node:fs`'s `globSync`, which does not exist before it. Newer versions,
including Node 24, are fine.

Every build tool is open source and comes from npm. Nothing is fetched at build
time beyond the packages in `package-lock.json`, and the build does not reach
the network.

## Build

```bash
npm ci                 # exact versions from package-lock.json
npm run build          # → dist/firefox and dist/chrome
```

`dist/firefox/` is the contents of the shipped `microbrewery-firefox-*.zip`,
and `dist/chrome/` of `microbrewery-chrome-*.zip`.

## The one thing that will not match

`manifest.json` carries no `version` in `targets/`. The build stamps it, from
`--version` if given and from `package.json` otherwise:

```bash
node build.mjs --browser firefox --version 1.2.3
```

So to reproduce a *released* archive exactly, pass the released version — a
plain `npm run build` stamps whatever `package.json` currently says, which will
usually be older. Everything else is byte-identical.

## Checking it

```bash
npm run check          # lint, both typechecks, tests, both builds, add-on lint
```

This is what CI runs on every pull request. `npm test` alone runs the suite
(828 tests) under `node:test` against a jsdom document.
