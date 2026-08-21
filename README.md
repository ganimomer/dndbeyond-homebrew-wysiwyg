# Microbrewery

A browser extension that turns the [D&D Beyond](https://www.dndbeyond.com)
homebrew **monster** builder into a WYSIWYG editor. On the editor page it adds a
floating **"Open in Microbrewery"** button; opening it shows a **live stat-block
preview** of the creature you're editing, matching D&D Beyond's own rendering
and updating as you change the form.

Built Firefox-first, but the real work lives in a shared, browser-agnostic core
with a thin per-browser layer for each extension format.

> **Status.** The launcher, the full read of the monster editor form, and the
> faithful 2014/2024 rendering are working end-to-end against the live page.
> Every field on the block is editable — name, the meta line, ability scores,
> armor class, hit points, speed, skills, saving throws, damage adjustments,
> condition immunities, senses, gear and languages — and **every description
> section** — traits and actions through to the Description below the block —
> is a [Lexical](https://lexical.dev) rich-text editor that writes back to the
> form, an **entry at a time**: a blank line ends a trait and starts the next,
> the gap between two offers to merge them, and a drag handle moves one within
> its section or into another. **Autosave** persists all of it without a page
> reload. This pulls
> Lexical + Preact into the content script (~400 KB minified); release builds
> are minified.
>
> The block is a [Preact](https://preactjs.com) tree over an `EditorStore`, and
> every edit is a `Command` — see **Architecture** below.
>
> A section D&D Beyond holds *no* text for isn't printed at all — so an **"Add
> section"** button beside the block puts one there, empty and with the caret
> already in it, and a trash on every section heading takes it back off again.
>
> The D&D Beyond ⇄ editor markup codec has unit + headless-Lexical round-trip
> tests, and the whole loop is exercised against a captured copy of the real
> form: `npm test`.

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

Whole **sections** work the same way, one level up. A section the creature has
no text for isn't printed, and the solid **"Add section"** button in the column
beside the block — under the artwork, and sticky, so it follows the page down
but never rides above the line the sections start on — offers whichever are
missing and drops the caret straight into the new one. Every section heading
carries a **trash** that takes it off again: one click while it's still empty,
and a confirm once there is prose to lose, since removing it clears D&D Beyond's
field. Mythic and lair actions aren't on offer — DDB keeps each behind a
checkbox on the form and won't read the textarea back while it's unticked, so
tick the box there and the section appears on its own merit. In the 2014 layout,
where Traits prints with no heading at all, its trash rides the top right of the
body on hover instead.

Inside a section, an author edits **one entry at a time**. Traits and actions
aren't prose — they're lists, and D&D Beyond stores each list as a single run of
paragraphs whose only structure is that an entry opens with its name in bold. So
the section is cut there on the way in and concatenated on the way out, and what
the author gets hold of is a trait rather than the wall of text it sits in: its
own editor, its own trash, an **"Add trait"** at the foot of the section, and a
new entry that opens with the caret in it and bold italic already switched on.

Three ways to change what the entries *are*. **A blank line ends one** — press
Enter twice and the entry closes, a new one opens under it with the caret in it,
and anything that was below the cut comes with it. **Merge**, offered in the gap
between two entries when it's pointed at, says the two are really one; D&D
Beyond learns nothing, because joining two entries back up produces the very
string it already has. And a **drag handle** in the block's own margin picks an
entry up: reorder it within its section, or drop it into another one to turn an
action into a bonus action. The same move is on the keyboard — ↑/↓ on the
handle, Alt+↑/↓ to the section above or below.

A kebab **context menu** on the name row (styled after the Encounters tool)
switches ruleset — **Use 5e / Use 5.5e stat block**, which writes back to the
form's Stat Block Type field. Closing is its own button beside it: leaving is
the one action that shouldn't take two clicks to find.

## Legendary

Legendary Actions are the one section D&D Beyond gates: it keeps the status in
an **"Is Legendary?" checkbox**, and while that box is unticked it won't read
the textarea back and won't keep what's in it on save. So the checkbox isn't a
flag beside the section — it is what makes the section exist, and a stat block
with no way to tick it has no way to write legendary actions at all.

The kebab's **Make legendary** ticks it, and the creature wears a **crown chip**
at the right of its meta row from then on. Two things come with the crown,
because they are what the author would otherwise do by hand: a **Legendary
Resistance** trait at the top of Traits — 3/Day, named after the creature, and
only if it hasn't got one already — and the **Legendary Actions** section, open
with an empty entry and the caret in it. Either way, added or already there, the
resistance trait lights up for a moment: the count is the author's to agree
with.

The chip's ✕ takes it all back off. With nothing to lose it goes on one click;
with a resistance trait or any legendary actions written, it **asks first** and
names what would go, because that reaches into two sections the author isn't
looking at. While the creature is legendary its Legendary Actions section has no
trash of its own — the crown put it there, and the crown is what removes it.

Mythic and lair actions still want their boxes ticked in DDB's own form.

## Architecture

```
src/
├── content/index.ts      content-script entry: detect editor, show launcher ↔ panel, SPA nav
├── background/index.ts   background entry (home for future storage/message routing)
├── platform/             browser.* API wrapper (webextension-polyfill) + build globals
├── adapter/              the seam between our model and DDB's DOM
│   ├── types.ts            PageAdapter interface
│   ├── ddb-monster.ts      reads/writes form#monster-form, saves it via fetch
│   ├── ddb-listings.ts     skills/movements/senses — DDB's separate records
│   ├── ddb-markup.ts       bidirectional DDB-macro ⇄ editor-span codec
│   └── __fixtures__/       a real captured edit page, for the end-to-end test
├── statblock/            the domain model — no DOM, no D&D Beyond
│   ├── model.ts            Monster (`ruleset` discriminator, per-section HTML)
│   ├── compute.ts          modifiers, saves, proficiency, CR → XP
│   ├── skills.ts / movement.ts / senses.ts / adjustments.ts / armor-class.ts
│   └── sample.ts           era-accurate sample vampires (5e + 5.5e)
├── state/                the spine
│   ├── store.ts            EditorStore: the creature + the session, one subscription
│   ├── session.ts          what the editor knows that the form doesn't
│   ├── command.ts          Command + CommandStack (batching, coalescing)
│   ├── commands.ts         one constructor per edit
│   ├── editing.ts          PageAdapter's shape, dispatched as commands
│   ├── legendary.ts        what the crown means: the tick, the trait, the section
│   └── avatar-uploads.ts   the avatars: file picker, save-at-once, outcome
├── ui/                   the injected editor, in Preact
│   ├── App.tsx             overlay chrome; the only store subscriber
│   ├── StatBlock.tsx       layout + the Description section
│   ├── Artwork.tsx         the picture, and the menu that uploads a new one
│   ├── AvatarToast.tsx     what became of a small-avatar upload
│   ├── AddSectionButton.tsx  the sticky "Add section" beside the block
│   ├── StatBlock5e.tsx     the 2014 layout      (+ .css)
│   ├── StatBlock55e.tsx    the 2024 layout      (+ .css)
│   ├── NameRow.tsx         name, the kebab (ruleset, make legendary), close
│   ├── fields/             one component per field, each with its own styles
│   │   ├── registry.ts       which rows are optional, and what the "Add…" menu offers
│   │   ├── LegendaryChip.tsx the crown, and the confirm that takes it off
│   │   └── Field.tsx         picks a row's control by which field it is
│   ├── prose/              the description sections, an entry at a time
│   │   ├── section-registry.ts  the sections' names, and which can be added
│   │   ├── section-items.ts     cutting a section into entries, and back again
│   │   ├── SectionList.tsx      a section as its list of entries (+ ItemGap, Merge)
│   │   ├── ProseItem.tsx        one entry: a Lexical editor and its format bar
│   │   ├── drag-context.tsx     where the sections meet, so an entry can cross
│   │   ├── item-drag.ts         where a dragged entry would land, in numbers
│   │   └── RemoveSection.tsx    the trash that takes one back off
│   └── shared/            Chip, OptionPicker, ContextMenu, ConfirmDialog, MiniForm,
│                           SaveSlot, icons
└── editor/               what hasn't found a better home yet
    ├── fab.ts              the "Open in Microbrewery" launcher
    ├── panel.tsx           the host element + shadow root the tree mounts into
    ├── autosave.ts         debounced, single-flight save controller + retry
    ├── save-indicator.ts   paints save state into the components' slots
    ├── prose-editor.ts     one entry's Lexical editor (mount, edit, split, commit)
    └── nodes.ts            RollNode / RefNode — DDB roll & reference tokens

targets/                 the thin per-browser layer — just manifests
build.mjs                bundles the shared src into dist/<browser>/ + copies the manifest
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

`observe()` watches the form so the block updates live. Write-backs set the
control's value and dispatch a bubbling `input`+`change`, leaving autosave to
persist them.

**Skills, movements and senses are the exception.** They aren't form fields at all: each
row is a separate server record, which is why D&D Beyond's own "Add a Skill" /
"Add a Movement" navigates away and saves. So those methods are async and persist
themselves (see `adapter/ddb-listings.ts`, which says it once for all three) — a POST to `/monster/skills/create/<monsterId>` or
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

**Avatars are the exception.** Uploading one is a deliberate act with a slow,
heavy request behind it, so it doesn't wait out the debounce: `AvatarUploads`
(`src/state/avatar-uploads.ts`) asks autosave to `flush()` and reports what
happened. There is still no upload endpoint — the picker is D&D Beyond's own
`#field-avatar` / `#field-large-avatar`, clicked from inside the author's click,
so the file lands in the form `save()` already serializes and rides the ordinary
POST. On success the input is emptied, or every later save would post the image
again; on failure it stays, and the next save carries it.

The large avatar changes on the block the moment the file is chosen and keeps
showing it afterwards — DDB's preview `<img>` is server-rendered and never
updates in place, so re-reading the form would put the old picture back. It
reverts if the save doesn't land. The small avatar has nowhere to appear on the
block, so it reports in a toast at the corner of the screen instead. Neither is
a `Command`: there is no undoing an upload, since the file it replaced is gone.

**TinyMCE.** The description fields are TinyMCE 4 editors that only sync their
textarea at submit time, so writing the textarea alone would let DDB's own Save
button silently revert our prose. The content script is in an isolated world and
can't reach `window.tinymce`, but the editor body is same-origin DOM
(`#<textareaId>_ifr`), and TinyMCE's model tracks it — so `setDescription`
writes both, and the two save paths agree.

## License

TBD.
