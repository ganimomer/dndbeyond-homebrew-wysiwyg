# Microbrewery

A browser extension that turns the [D&D Beyond](https://www.dndbeyond.com)
homebrew **monster** builder into a WYSIWYG editor. On the editor page it adds a
floating **"Open in Microbrewery"** button; opening it shows a **live stat-block
preview** of the creature you're editing, matching D&D Beyond's own rendering
and updating as you change the form.

Built Firefox-first, but the real work lives in a shared, browser-agnostic core
with a thin per-browser layer for each extension format.

> **Status.** The launcher, the full read of the monster editor form, and the
> faithful 2014/2024 preview are working end-to-end against the live page.
> Editing back into the form (write-back) is the next feature — the preview is
> currently read-only.

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
├── content/index.ts      content-script entry: detect editor, show launcher ↔ panel, SPA nav
├── background/index.ts   background entry (home for future storage/message routing)
├── platform/            browser.* API wrapper (webextension-polyfill) + build globals
├── adapter/             the seam between our model and DDB's DOM
│   ├── types.ts         PageAdapter interface
│   └── ddb-monster.ts   monster adapter — reads form#monster-form (field-* ids, listing tables)
├── statblock/           the domain model
│   ├── model.ts         Monster model (`ruleset` discriminator, per-section `descriptionHtml`)
│   ├── compute.ts       ability modifiers, saves, proficiency, CR → XP, meta line
│   └── sample.ts        era-accurate sample vampires (2014 + 2024)
├── editor/              the injected UI
│   ├── fab.ts / fab.css     the "Open in Microbrewery" launcher
│   └── panel.ts / panel.css the WYSIWYG panel (preview + ruleset toggle + close)
└── preview/             the live preview
    ├── statblock-view.ts   dispatcher: renders by monster.ruleset
    ├── render-2024.ts      2024 "mon-stat-block-2024" layout
    ├── render-2014.ts      2014 classic layout
    ├── statblock-2024.css  2024 styling (scoped .statblock.v2024)
    ├── statblock-2014.css  2014 styling (scoped .statblock.v2014)
    ├── sections.ts         section body: DDB HTML (preferred) or structured entries
    ├── sanitize-html.ts    allowlist sanitizer for DDB's description HTML
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
4. Open a homebrew **monster editor** page (`…/homebrew/creations/monsters/<id>/edit`)
   — the **Open in Microbrewery** button appears bottom-right.

**Chrome / Edge**

1. `npm run build:chrome`
2. Go to `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → pick the `dist/chrome` folder

## How the editor is read

All of D&D Beyond's DOM knowledge is funneled into **`src/adapter/ddb-monster.ts`**.
The editor is a server-rendered form (`form#monster-form`) with stable
`id="field-*"` controls, so `read()`:

- pulls scalar fields (`#field-Name`, `#field-armor-class`, `#field-strength`…)
  and reads the **selected option text** of coded `<select>`s (size, type,
  alignment, CR, saves, damage adjustments);
- composes HP / initiative, and parses the **listing tables** for Movement
  (Speed), Skills, and Senses (`table.listing-rpgmonster-*-mapping`);
- takes each description section's ready-made HTML from the
  `#field-<section>-description-wysiwyg` textareas, converting DDB's inline
  `[rollable]…[/rollable]` and `[type]…[/type]` markup to spans;
- detects the layout from `#field-stat-block-type` (`5e` → 2014, `5.5e` → 2024).

`observe()` watches the form so the preview updates live. `write()` (pushing
edits back into the form) is not implemented yet.

## License

TBD.
