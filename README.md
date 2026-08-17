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

The preview renders a full 5e stat block from the shared model in **either D&D
Beyond layout** — the 2024 `mon-stat-block-2024` design (Initiative on the AC
line, two Mod/Save ability tables, short tidbit labels) or the classic 2014
layout — picked by each monster's `ruleset`. Colors, spacing, and the frame are
reproduced from DDB's own compiled CSS; the licensed fonts (`Scala Sans`,
`MrsEavesSmallCaps`) are named so the shadow root inherits them from DDB's
document-scoped `@font-face` at runtime. Ability modifiers, saves, proficiency
bonus, and XP are all derived. Inline `{...}` tokens are placeholders for D&D
Beyond's roll/reference tags; `**bold**`, `*italic*`, and newlines are also
supported in entry text.

A **2014 / 2024 toggle** in the panel header switches layouts for comparison;
once the form is wired, the adapter will report the ruleset instead.

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
│   ├── model.ts         Monster model (incl. `ruleset` discriminator)
│   ├── compute.ts       ability modifiers, saves, proficiency, CR → XP, meta line
│   └── sample.ts        era-accurate sample vampires (2014 + 2024)
└── preview/             the live preview
    ├── statblock-view.ts   dispatcher: renders by monster.ruleset
    ├── render-2024.ts      2024 "mon-stat-block-2024" layout
    ├── render-2014.ts      2014 classic layout
    ├── statblock-2024.css  2024 styling (scoped .statblock.v2024)
    ├── statblock-2014.css  2014 styling (scoped .statblock.v2014)
    ├── inline.ts           {roll}/**bold**/*italic*/newline expander
    └── dom.ts              tiny element builder

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
