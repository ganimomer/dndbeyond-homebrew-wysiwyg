# D&D Beyond Homebrew WYSIWYG

A browser extension that turns the [D&D Beyond](https://www.dndbeyond.com)
homebrew creation page into a WYSIWYG editor. It targets the **monster / stat
block** builder first, and its headline feature is a **live stat-block preview**
that renders your creature the way it will look, updating as you edit.

Built Firefox-first, but the real work lives in a shared, browser-agnostic core
with a thin per-browser layer for each extension format.

> **Status: scaffolding.** The cross-browser skeleton, build, and live preview
> are working end-to-end. The one piece still to wire is reading/writing D&D
> Beyond's *actual* form fields — the live page is behind auth and rendered
> client-side, so its selectors have to be captured from a real session. See
> [Wiring the real page](#wiring-the-real-page).

## Preview

The preview renders a full 5e stat block from the shared model, with ability
modifiers, proficiency bonus, and XP derived from the challenge rating. Inline
`{...}` tokens are placeholders for D&D Beyond's special tags (dice, condition
and monster references) that we'll expand into real links.

## Architecture

```
src/                     shared, browser-agnostic core (all the real logic)
├── content/index.ts      content-script entry: detect page, mount panel, follow SPA nav
├── background/index.ts   background entry (home for future storage/message routing)
├── platform/            browser.* API wrapper (webextension-polyfill) + build globals
├── adapter/             the seam between our model and DDB's DOM
│   ├── types.ts         PageAdapter interface
│   └── ddb-monster.ts   monster adapter — ⚠️ selectors are placeholders (see below)
├── statblock/           the domain model
│   ├── model.ts         Monster stat-block model
│   ├── compute.ts       ability modifiers, proficiency, CR → XP
│   └── sample.ts        example creature used until the page is wired
└── preview/             the live preview
    ├── statblock-view.ts  model → 5e stat-block DOM
    └── statblock.css      classic parchment styling (injected into a shadow root)

targets/                 the thin per-browser layer — just manifests
├── firefox/manifest.json   MV3 + browser_specific_settings, background.scripts
└── chrome/manifest.json    MV3 + background.service_worker

build.mjs                bundles the shared src into dist/<browser>/ + copies the manifest
```

The design principle: **everything above the `PageAdapter` interface is
browser- and page-agnostic**, and everything below it knows about D&D Beyond's
DOM. Supporting another content type later (spells, magic items) means adding an
adapter, not touching the editor or preview. Supporting another browser means
adding a manifest under `targets/`.

The injected UI lives entirely inside a **shadow root**, so DDB's page styles
can't leak into the stat block and vice versa.

## Build

```bash
npm install
npm run build          # builds both dist/firefox and dist/chrome
npm run build:firefox  # Firefox only
npm run build:chrome   # Chrome only
npm run dev:firefox    # rebuild on change
npm run typecheck
```

## Load the extension

**Firefox**

1. `npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…** → pick `dist/firefox/manifest.json`
4. Open a D&D Beyond homebrew page — the panel appears top-right.

**Chrome / Edge**

1. `npm run build:chrome`
2. Go to `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → pick the `dist/chrome` folder

## Wiring the real page

All of D&D Beyond's DOM knowledge is deliberately funneled into one file so
this is a localized change:

- **`src/adapter/ddb-monster.ts`** → the `SELECTORS` object and `URL_PATTERN`.
  Replace each placeholder selector with the real one from the live monster
  builder, then flesh out `read()` (parse repeating trait/action groups) and
  `write()` (push values back and dispatch the `input`/`change` events DDB's
  React state listens for).

Until those are real, `read()` falls back to sample/best-effort data so the
preview always has something to show, and `write()` is a no-op so we never
clobber the form.

## License

TBD.
