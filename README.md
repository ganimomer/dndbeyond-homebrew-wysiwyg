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
> Ability scores, the ruleset, creature type/subtype, **skills**, **saving
> throw proficiencies** and **movement types** are editable. The **Traits** section is the
> first editable prose block: it mounts a [Lexical](https://lexical.dev) rich-text
> editor and writes edits back to DDB's form (the foundation for editing every
> section). **Autosave** persists those edits without a page reload. This pulls
> Lexical + lit-html into the content script (~290 KB minified / ~96 KB gzip);
> release builds are minified. The remaining prose sections and the lit-html view
> conversion are next.
>
> The D&D Beyond ⇄ editor markup codec has unit + headless-Lexical round-trip
> tests: `npm test`.

## Preview

Opening the launcher shows a **full-page** stat block that covers the editor
form and looks like the monster viewed outside edit mode. It renders from the
shared model in **either D&D Beyond layout** — the **5.5e** `mon-stat-block-2024`
design (Initiative on the AC line, two Mod/Save ability tables, short tidbit
labels) or the classic **5e** layout — picked by each monster's `ruleset`.
Colors, spacing, and the frame are reproduced from DDB's own compiled CSS; the
licensed fonts (`Scala Sans`, `MrsEavesSmallCaps`) are named so the shadow root
inherits them from DDB's document-scoped `@font-face` at runtime. Ability
modifiers, saves, proficiency bonus, and XP are all derived.

Everything from the name down to the last tidbit is **one section** (`.basics`),
because that's how it reads — not a header plus attributes plus stats plus
tidbits. Within it, **optional rows print only when the creature has them**, the
way a real stat block does: no Skills row on a creature with no skills, no
dangling comma where an alignment isn't set. An **"Add…" menu** at the foot of
the section lists whatever is missing and puts it back, empty and ready to fill
in; a field added that way sticks around for the session, and drops off again
the moment its last value is removed.

A kebab **context menu** on the name row (styled after the Encounters tool)
switches ruleset — **Use 5e / Use 5.5e stat block**, which writes back to the
form's Stat Block Type field — or **Close** to restore the editor.

## Architecture

```
src/                     shared, browser-agnostic core (all the real logic)
├── content/index.ts      content-script entry: detect editor, show launcher ↔ panel, SPA nav
├── background/index.ts   background entry (home for future storage/message routing)
├── platform/            browser.* API wrapper (webextension-polyfill) + build globals
├── adapter/             the seam between our model and DDB's DOM
│   ├── types.ts         PageAdapter interface
│   └── ddb-monster.ts   monster adapter — reads/writes form#monster-form, saves it via fetch
├── statblock/           the domain model
│   ├── model.ts         Monster model (`ruleset` discriminator, per-section `descriptionHtml`)
│   ├── compute.ts       ability modifiers, saves, proficiency, CR → XP, meta line
│   ├── skills.ts        the 18 skills → governing ability, and the derived bonus
│   ├── movement.ts      movement types, print order, and the smart speed defaults
│   ├── senses.ts        sense types and the range each one usually arrives with
│   ├── adjustments.ts   splits DDB's "Acid - Resistance" option labels
│   └── sample.ts        era-accurate sample vampires (5e + 5.5e)
├── editor/              the injected UI
│   ├── fab.ts / fab.css                 the "Open in Microbrewery" launcher
│   ├── panel.ts / panel.css             the full-page editor overlay
│   ├── ability-editing.ts               live ability-score inputs + dependency highlights
│   ├── meta-editing.ts                  creature type dropdown + subtype tag editor
│   ├── skills-editing.ts                skill chips + the "＋" menu (computes the bonus)
│   ├── saves-editing.ts                 save chips (5e) / proficiency dots (5.5e)
│   ├── speed-editing.ts                 movement chips with inline, defaulted distances
│   ├── adjustments-editing.ts           damage-adjustment + condition-immunity chips
│   ├── senses-editing.ts                sense chips, inline ranges, passive Perception
│   ├── text-field-editing.ts            the one-input rows (Gear, Languages) and their ✕
│   ├── field-visibility.ts              the "Add…" menu of fields not on the block
│   ├── inline-input.ts                  shared commit-on-Enter for the inline number fields
│   ├── autosave.ts                      debounced, single-flight save controller + retry
│   ├── save-indicator.ts                paints save state into the renderers' slots
│   ├── prose-editor.ts                  a section's Lexical editor (mount, edit, commit)
│   ├── nodes.ts                         RollNode / RefNode — DDB roll & reference tokens
│   └── context-menu.ts / context-menu.css  Encounters-style kebab menu
└── preview/             the live preview
    ├── statblock-view.ts   dispatcher: renders by monster.ruleset
    ├── render-55e.ts       5.5e "mon-stat-block-2024" layout
    ├── render-5e.ts        5e classic layout
    ├── statblock-55e.css   5.5e styling (scoped .statblock.v55e)
    ├── statblock-5e.css    5e styling (scoped .statblock.v5e)
    ├── meta.ts             the size/type/subtype/alignment line
    ├── optional-fields.ts  which basics rows are optional, and what each one renders
    ├── tags.ts             chip primitives + the "Add…" footer
    ├── skills-line.ts      the Skills row's chips + "＋" host
    ├── saves-line.ts       the 5e Saving Throws row's chips + "＋" host
    ├── speed-line.ts       the Speed row's chips, each with an editable distance
    ├── adjustments-line.ts the vulnerability/resistance/immunity rows' chips
    ├── senses-line.ts      the Senses row: chips, ranges, passive Perception
    ├── text-line.ts        the rows that are a single free-text field
    ├── icons.ts            inlined Material icon paths (menu, save indicator, proficiency dots)
    ├── sections.ts         section body: DDB HTML (preferred) or structured entries
    ├── sanitize-html.ts    allowlist sanitizer for DDB's description HTML
    ├── ddb-markup.ts       bidirectional DDB-macro ⇄ editor-span codec (round-trip safe)
    ├── inline.ts           {roll}/**bold**/*italic*/newline expander (samples only)
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
- detects the layout from `#field-stat-block-type` (`0` → `5e`, `1` → `5.5e`).

`observe()` watches the form so the preview updates live. Write-backs
(`setRuleset`, `setAbility`, `setType`/`setSubTypes`, `setSavingThrows`,
`setDescription`) all set the control's value and dispatch a bubbling
`input`+`change`, leaving autosave to persist them. Broader field editing is a
later feature.

**Skills and movements are the exception.** They aren't form fields at all: each
row is a separate server record, which is why D&D Beyond's own "Add a Skill" /
"Add a Movement" navigates away and saves. So those methods are async and persist
themselves — a POST to `/monster/skills/create/<monsterId>` or
`/monster/movement/<id>/edit` (reusing the edit page's anti-forgery tokens), and
to `…/delete` (which instead needs the `RequestVerificationToken` cookie, as
DDB's own `ajax-post` links send). All of them patch the listing table in place,
so the preview re-renders through `observe()` without a reload. Note that a
rejected request comes back as **200 redirected to `/error`**, so success is
tested on the URL, not the status. Editing a movement posts its existing note
back untouched, since the form would otherwise clear it.

Saving throws, by contrast, are one ordinary multi-select
(`#field-monster-saving-throw`), and DDB derives a proficient save as
`mod + PB` itself — so toggling proficiency never writes a bonus.

## Autosave

Edits persist by themselves — no page reload, no hunting for DDB's Save button.

Text and number fields commit on **blur**, selects on **change**, and prose on
the Lexical editor's own commit; all of them feed one **3-second debounce** in
`AutosaveController` (`src/editor/autosave.ts`), which then calls
`adapter.save()`. That replays the POST D&D Beyond's own Save button would send
— `multipart/form-data` built with `new FormData(form#monster-form)` — as a
`fetch`, so the page never navigates. Serializing DDB's *live form* rather than
our model is what makes this safe: the payload is byte-for-byte a native submit,
and the anti-forgery tokens come along as ordinary hidden inputs.

Saves take ~5.5 s against DDB, so the controller runs **one at a time**: edits
arriving mid-flight are coalesced into a single follow-up rather than racing.
A failure retries once quietly, then surfaces.

While a save is running, a spinner appears at the **right end of the heading of
whichever section you edited**; edits to the top area (abilities, creature
type/subtype, ruleset) put it in the **name row, just before the context menu**.
The renderers reserve an empty `.save-slot[data-save-origin]` in each heading —
the same "renderers mark the spot, the editor supplies behavior" contract as
`data-mod`/`data-dep` — and `src/editor/save-indicator.ts` fills them. A section
with no heading to hang a slot on (the 5e Traits block) falls back to the name
row. A failed save turns its slot into a click-to-retry button.

**TinyMCE.** The description fields are TinyMCE 4 editors that only sync their
textarea at submit time, so writing the textarea alone would let DDB's own Save
button silently revert our prose. The content script is in an isolated world and
can't reach `window.tinymce`, but the editor body is same-origin DOM
(`#<textareaId>_ifr`), and TinyMCE's model tracks it — so `setDescription`
writes both, and the two save paths agree.

## License

TBD.
