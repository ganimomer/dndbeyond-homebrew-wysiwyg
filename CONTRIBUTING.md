# Contributing

## Getting set up

Node **22 or newer** — a real floor, not a preference: `scripts/test.mjs` globs
with `node:fs`'s `globSync`, which doesn't exist before it. There's an `.nvmrc`,
so `nvm use` picks the right one.

```bash
npm install
```

## Build

```bash
npm run build          # builds both dist/firefox and dist/chrome
npm run build:firefox  # Firefox only
npm run build:chrome   # Chrome only
npm run dev:firefox    # rebuild on change

npm run harvest:references   # re-reads DDB's closed-compendium ids (network)
```

`build.mjs` bundles the shared `src/` into `dist/<browser>/` and copies that
browser's manifest over it. The manifests in `targets/` carry no `version`; the
build stamps one, from `--version` if given and from `package.json` otherwise.

Load the result unpacked — see [Install](README.md#install).

## Checks

```bash
npm run check          # everything below, in the order CI runs it
```

| | |
|---|---|
| `npm run lint` | ESLint over the whole repo, build scripts included |
| `npm run typecheck` | the extension |
| `npm run typecheck:tests` | the tests, which have their own tsconfig |
| `npm test` | the suite, under `node:test` against a jsdom document |
| `npm run build` | both browsers |
| `npm run lint:ext` | Mozilla's add-on linter over `dist/firefox` |

`npm run check` is exactly what [the CI workflow](.github/workflows/ci.yml)
runs, so a green local run is a green pull request. Every PR into `main` has to
pass it before it can be merged.

## How it's laid out

```
src/content/    content-script entry: detect the editor, launcher ↔ panel
src/background/ background entry
src/platform/   browser.* API wrapper (webextension-polyfill) + build globals
src/adapter/    the seam between our model and D&D Beyond's DOM
src/statblock/  the domain model — no DOM, no D&D Beyond
src/state/      EditorStore, and every edit as a Command
src/ui/         the injected editor, in Preact
src/editor/     Lexical, reference tooltips, autosave
targets/        the thin per-browser layer — just manifests
```

Three seams carry the design.

**The `PageAdapter` interface.** Everything above it is browser- and
page-agnostic; everything below knows D&D Beyond's DOM. Supporting another
content type later means adding an adapter, not touching the editor.

**The store.** `EditorStore` holds the creature — re-read from DDB's form, which
stays the source of truth, so their inputs and ours never disagree — plus the
session state that only the editor knows: which optional rows the user revealed,
which abilities they have touched, what the armor was worth before they started.
`App` is its only subscriber; everything below reads through context.

**Commands.** Every edit is a `Command` that knows how to apply itself and how
to put itself back, captured with the value it replaced. That is what collapsed
the save requests into one path, and what `transaction()` — templates, bulk
edits — is built on. (Undo is not wired to a key; the pipeline is.)

The injected UI lives entirely inside a **shadow root**, so DDB's page styles
can't leak into the stat block and vice versa.

## Where the reasoning lives

In the code. Every module opens with a header comment explaining what it is for
and why it is the way it is — which redirect tier costs a second and how the
design avoids paying it, why the first tooltip that answers isn't the answer,
why a shield adds to the stated armor class instead of recomputing it. Those
comments are the design record; read a file's header before changing it, and
keep it true when you do.

## Releasing

Actions → **Release** → *Run workflow*, on `main`. Pick `patch`, `minor` or
`major`; leave **version** blank unless you mean to override it.

That is the whole thing. The workflow refuses to run off `main`, works out the
version from the last `vX.Y.Z` tag, runs `npm run check`, builds both browsers
with that version stamped into their manifests, and publishes a GitHub Release
carrying three archives:

| | |
|---|---|
| `microbrewery-firefox-<v>.zip` | installable, `manifest.json` at the root |
| `microbrewery-chrome-<v>.zip` | same, for Chrome and Edge |
| `microbrewery-source-<v>.zip` | the tracked tree, for add-on review |

Release notes are the commit subjects since the previous tag.

**The first release has no tag to count from**, so a bump has no base — the
workflow will stop and say so. Put the version you want in the **version** box
(`0.1.0`, or `1.0.0` if you consider it done) for that one run only.

Nothing is ever committed back to `main`. The tags are the record of what has
shipped, which is also why this doesn't collide with the branch ruleset.

## Publishing to the stores

**None of this is automated, and the first submission can't be** — there is no
listing for an API to update until you have made one by hand. Do it once per
store; automation can come after.

### Before either store will take it

- [ ] **An icon set.** The extension has none today: no `icons` key in either
      `targets/*/manifest.json`, so it shows as a generic puzzle piece. Needs
      16, 32, 48 and 128px PNGs. Chrome will not publish without the 128; AMO
      uses it as the listing image.
- [ ] **At least one screenshot at 1280×800.** Both stores. Chrome allows five
      and it is worth filling all five.
- [ ] **A 440×280 small promotional tile** — Chrome only, and mandatory.
      Extensions without one are ranked below extensions with one.
- [ ] **A disclaimer.** "Microbrewery" is a good name precisely because it
      carries nobody else's mark, but the description names D&D Beyond. Both
      stores prohibit implying an affiliation you do not have. Say plainly, in
      both listings and the README: *not affiliated with or endorsed by Wizards
      of the Coast or D&D Beyond.*

### Firefox — addons.mozilla.org

No fee. Sign in at the [Developer Hub](https://addons.mozilla.org/developers/),
submit a new add-on, upload `microbrewery-firefox-<v>.zip`, choose **listed**.

- **You will be asked for source.** The extension is bundled and minified, so
  Mozilla's source-code submission rule applies. Upload
  `microbrewery-source-<v>.zip`; `BUILDING.md` at its root is the build
  instruction file reviewers look for. Reviewers rebuild on Ubuntu with a
  recent Node — worth running `npm ci && npm run build` on Node 24 once
  yourself, because a reviewer hitting a build failure is a rejection.
- **License**: MIT. Required at submission; that is why `LICENSE` exists.
- The add-on id is already pinned in the manifest
  (`dndbeyond-homebrew-wysiwyg@ganimomer.dev`), so updates attach to the same
  listing.

### Chrome — Chrome Web Store

[Register](https://developer.chrome.com/docs/webstore/register) first: **$5,
one time**, covering up to 20 extensions. Then create the item and upload
`microbrewery-chrome-<v>.zip`.

Most reviews finish within three days, but Google explicitly flags new
developers, new extensions and broad permissions for closer scrutiny — expect
the first one to be the slow one. `host_permissions` is scoped to
`*://*.dndbeyond.com/*` rather than `<all_urls>`, which is the best thing going
for review time; be ready to explain in the reviewer notes why the extension
needs to read and write the homebrew editor form.

### Automating it later

Once both listings exist, a `release: published` trigger can update them:
[`web-ext sign`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
v8+ submits listed AMO versions, and
[`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
handles Chrome. Keep it on `release: published` rather than on every merge —
both stores review what you send, and shipping is worth one deliberate click.

One trap for later: the Chrome refresh token stops working if it goes six
months unused.
