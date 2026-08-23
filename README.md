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
> reload. Every reference in the prose — a condition, a spell, a glossary term
> — **hovers to D&D Beyond's own definition**, borrowed from their tooltip
> endpoint and styled by their own stylesheet, and a **`/` slash command** adds
> a new one without anyone typing a macro — including a spell or a monster,
> picked off D&D Beyond's own browse page **framed beside the block**. This
> pulls
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
field. Mythic actions aren't on offer — DDB keeps them behind a checkbox on the
form and won't read the textarea back while it's unticked, so tick the box there
and the section appears on its own merit. In the 2014 layout, where Traits prints
with no heading at all, its trash rides the top right of the body on hover
instead.

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

## Hover a reference

A stat block is full of references — a condition, a spell, a glossary term —
and on D&D Beyond's own pages each one is a link you can hover to read the
definition without leaving the block. In the preview they now are too, and the
definitions are **D&D Beyond's own**: we don't keep a compendium, we borrow
theirs.

Not their tooltip *widget*, though. That's CurseTip, a page-world global that
binds a listener per element, so anything of ours in a shadow root would be
invisible to it without a main-world bridge. What we reuse is the two things
underneath it. The **content** comes from `GET /<path>/<id>/tooltip`, the
endpoint their widget reads, which answers a parenthesised JSON literal left
over from being consumed as JSONP. The **look** comes from putting the popup in
the *light* DOM, appended to `document.body` rather than into our shadow root —
which is where DDB's stylesheet already is, so their markup arrives styled, down
to the header art and the colour of the type badge. There is no tooltip design
in this repo.

The awkward part is that a stored macro carries a *name* and the endpoint wants
a numeric *id*. So `src/adapter/ddb-references.ts` resolves in tiers, cheapest
first: a **table shipped with the extension** for the closed compendiums —
conditions, senses, skills, actions, weapon properties, and the 127-entry rules
glossary, harvested by `npm run harvest:references` and committed so a fresh
clone works offline; then **ids this browser has learned before**, kept in
`storage.local`; and only then the **canonical slug URL**, which 301s to the
numbered one (`/spells/detect-magic` → `/spells/2065-detect-magic`), read off
the redirect with the body cancelled so the page is never downloaded. A miss at
every tier just means no tooltip.

That last tier is the expensive one — about **a second**, nearly all of it
spent waiting on D&D Beyond to render a page we throw away — which is why so
much of the design is about not paying it. Three things keep it off the hover.

**The block warms itself.** `src/editor/ref-preload.ts` scans the rendered stat
block at idle and resolves every reference in it before anyone points at one,
at a priority that yields to a real hover. So the second or two after the panel
opens does the waiting, and by the time an author reaches a spell the answer is
already in hand. A `MutationObserver` — `childList` only, and read-only, so
Lexical never sees it — catches references that appear later.

**Asking and showing are separate clocks.** The popup still appears 250 ms after
the pointer settles, cached or not, because a tooltip that pops instantly when
warm and slowly when cold reads as a glitch. But the *request* starts at 60 ms,
so the wait and the network overlap instead of adding up. A pointer sweeping a
spell list still asks about nothing.

**Ids are remembered between sessions; definitions are not.** An id is public —
it is literally in a URL — and it never changes, so `reference-id-store.ts`
keeps it on disk and the slug lookup never repeats for a reference you have seen
before. A tooltip body stays in memory only: it is entitlement-shaped (see
below), it is not small, and D&D Beyond errata their text. Note that their
endpoint answers `no-cache` once the session cookie is attached, so there is no
HTTP cache doing any of this for us — the one source shared across panel
open/close is what makes reopening the overlay free.

Repeat hovers of the same reference share one request, and a *failed* request is
deliberately not remembered — an offline blip that poisoned the cache would
leave tooltips dead until the panel was reopened. Requests run four at a time
with one slot always held back, so a hover never queues behind the preloading.

**You see the books you own.** There's no token and no CSRF header on that
endpoint, but entitlement rides on the session cookie, and we fetch same-origin
from a dndbeyond.com page — so a sourcebook you haven't bought shows DDB's own
paywall tooltip, exactly as it would on their site.

Two rules hold the feature away from the editor it sits on top of. The popup
lives outside the shadow root, so Lexical's mutation observer — which reverts
DOM it didn't author — never sees it. And **nothing touches the token**:
`RefNode.updateDOM` re-asserts a `.ref` element's class and data attributes on
every reconcile, so the hover affordance is pure CSS and the controller never
mutates the editable, moves focus, or dispatches into it. Hovering with the
caret in a trait leaves the caret exactly where it was.

Known edges: a spell resolved from its name lands on the 2014 entry, which DDB's
own tooltip labels *Legacy*, so a 2024 creature can show 2014 text; the tokens
aren't focusable, so there's no keyboard route to a definition; the popup takes
no pointer events, so you can't select its text or follow the links inside it —
a trade DDB's own tooltips make too. Dice tokens don't hover yet.

## Add a reference

Reading a reference and writing one need opposite things. Reading gets the macro
handed to it, display text and all. Writing starts from nothing — so where the
tooltip resolver needed a *lookup*, this needs a **catalog**, which is what
`src/adapter/reference-catalog.ts` makes out of the same harvested tables.

Type **`/`** in any entry and a menu offers the kinds — Condition, Skill, Sense,
Action, Weapon property, Rule, and the two with a story of their own below,
Spell and Monster — narrowed by whatever you type after the slash. Pick one and the command comes
back out of the prose; a second menu opens with that compendium's contents and a
filter box. Pick again and the reference
is in the sentence, already underlined and already hovering for its definition,
because it lands as the same `RefNode` a reference from D&D Beyond does. The
**"+"** in the floating format bar reaches the same menu, for a reference you
didn't think of until after you'd typed the sentence.

What makes the two stages different is **where the caret is**. Choosing a kind
happens while the command is still in the prose, so the caret must stay in the
editor — a control that took focus would strand the `/con` being typed. That is
why the kind list has no filter box of its own (six rows don't need one, and the
command already narrows them) and why its arrow keys arrive second-hand, through
commands the editor takes off Lexical and hands over. Choosing an entity happens
after the command is gone: there is nothing left in the document to type into
and the glossary runs to 127 rows, so that stage takes the caret into a filter
box and where the reference goes survives as a saved point rather than as a
selection.

Only slashes that could be commands count. Stat-block prose is full of the other
kind — `1d6/round`, `60/120 ft.`, `Melee/Ranged` — so the slash has to start a
word, and a space after the query closes the menu again.

A reference also stops absorbing what is typed against it. `RefNode` is a
`TextNode` subclass, so `Grappled` plus an `s` used to become
`[condition]Grappleds[/condition]` — a macro naming a condition that doesn't
exist, spelt as a word plausible enough that nobody would look. Its *edges* are
now sealed and its text is not, because an author still has to be able to write
"fireballs", or "shape-shifts" where the glossary says "Shape-Shifting".

Damage types are not among the kinds, and won't be: there is no compendium behind
them (`/damage-types/<id>/tooltip` 404s), so a reference to one would be
underlined, look interactive, and resolve to nothing.

## Look a spell or a monster up

A spell can't be listed the way a condition can. **D&D Beyond has no search
endpoint** — `/api/search` and `/api/search/typeahead` both 404 — and which
spells exist for an author depends on what they own, so there is no table to
ship and nothing to ask. Their *browse page* is the only entitlement-aware
search there is. A monster is the same problem, and gets the same answer.

So a spell is asked for rather than picked. `/spell` opens a box: type the name
exactly and press Enter, and `[spells]Fireball[/spells]` is in the sentence.
Above the box is **Look up spell…**, and that is where the browse page comes in.

It opens **inside the overlay** — their page, framed at the same origin,
carrying the author's own session, so what it lists is exactly what they own.
The stat block slides left and D&D Beyond's own spell list takes the artwork's
column and everything the block can spare, already searched for whatever had
been typed. It arrives cut down to a picker: no navigation, no breadcrumbs, no
ads and no footer, so the top of the page is the **Spells** heading with a
**Close** at the right of its row; and no open indicator on a row, because a row
no longer opens — clicking anywhere on it picks that spell, inserts the
reference and puts the page away. Closing it without picking abandons the
reference and gives the caret back to the sentence.

**`/monster` is the same gesture over `/monsters`.** Their two listings are the
same page with different cells — `.monster-name` where the other has
`.spell-name` — and nothing the surgery reaches for is either, which is why both
fixtures run through the same tests. The one new thing a monster row has is a
portrait with a lightbox bound to it: the only place in a row where a click
already meant something, and the reason a click is *stopped* rather than merely
redirected.

Two things make this more than a convenience. Searching inside the frame is a
plain form submit, so **every search is a whole new document** — undressed,
navigation bar and all — which is why the surgery runs per load and a cover
stays over the frame from the moment a navigation starts until the page it lands
on has been cut down. And a row hands over its **numeric id**, which is the
expensive half of a tooltip: an unknown name otherwise costs a redirect through
a whole rendered page, about a second. Handed to the same store the resolver
reads, the reference an author just inserted hovers immediately. The id also
says *which* one — a legacy spell or monster and its 2024 replacement share a
name and a slug, and differ nowhere else a macro can see. Picking the 2014
Vampire off the list and hovering it gives back the 2014 Vampire, where the
macro's slug alone would have resolved to the newer one.

The listing shows what D&D Beyond shows, which includes books the author doesn't
own. Referencing one is allowed and inserts normally; its tooltip is then their
own "this content is part of the … digital content pack" panel, the same as
anywhere else on their site.

The moving is animated, and honours `prefers-reduced-motion` — read in JS as
well as in CSS, because the frame is unmounted on a timer and a timer that
outlived a transition which never ran would leave a dead panel on screen.

Magic items, equipment, armor, weapons and vehicles are the same page again,
each a table entry away. They are not there yet.

## Legendary, and lairs

Legendary and Lair Actions are the sections D&D Beyond gates: it keeps each
status in a checkbox — **"Is Legendary?"** and **"Has Lair?"** — and while a box
is unticked it won't read that textarea back and won't keep what's in it on
save. So a checkbox isn't a flag beside its section — it is what makes the
section exist, and a stat block with no way to tick one has no way to write
those actions at all.

The kebab's **Make legendary** ticks it, and the creature wears a **crown chip**
at the right of its meta row from then on. Two things come with the crown,
because they are what the author would otherwise do by hand: a **Legendary
Resistance** trait at the top of Traits — 3/Day, named after the creature, and
only if it hasn't got one already — and the **Legendary Actions** section, open
with an empty entry and the caret in it. Either way, added or already there, the
resistance trait lights up for a moment: the count is the author's to agree
with.

**Add lair** is the same gesture one checkbox over, and wears a **castle chip**
beside the crown. It opens Lair Actions the same way — and, on a **2024**
creature that has a Legendary Resistance trait, it grows the trait's
parenthetical: `(3/Day)` becomes `(3/Day, or 4/Day in Lair)`, because a creature
resists more often at home and that is the detail an author forgets. The in-lair
figure is **one more than whatever count the author actually wrote**, not a flat
four, so a 5/Day creature doesn't end up weaker on its own ground; a
parenthetical with no count to scale is left alone. Either way the trait lights
up, and the two gestures commute — making a creature legendary while it already
has a lair writes the clause in from the start.

Either chip's ✕ takes its own back off. With nothing to lose it goes on one
click; with a resistance trait, in-lair uses, or any actions written, it **asks
first** and names what would go, because that reaches into sections the author
isn't looking at. A section a chip owns has no trash of its own — the chip put
it there, and the chip is what removes it.

Mythic actions still want their box ticked in DDB's own form, and the **Lair XP**
field beside the lair checkbox isn't read at all.

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
│   ├── ddb-reference-map.ts  macro type → compendium path, and name → slug
│   ├── ddb-reference-ids.ts  the harvested closed-set ids and names (generated)
│   ├── reference-catalog.ts  the same tables as a list you can pick from
│   ├── ddb-references.ts   what DDB says a reference means, in four tiers
│   ├── reference-id-store.ts  ids learned from a redirect, kept on disk
│   ├── reference-source.ts   the page's one source, shared across panel opens
│   ├── task-queue.ts       two tiers of concurrency, one slot kept for hovers
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
│   ├── lair.ts             what the castle means, including the in-lair uses
│   ├── legendary-resistance.ts  the trait itself: finding, writing, its parenthetical
│   └── avatar-uploads.ts   the avatars: file picker, save-at-once, outcome
├── ui/                   the injected editor, in Preact
│   ├── App.tsx             overlay chrome; the only store subscriber
│   ├── StatBlock.tsx       layout + the Description section
│   ├── Artwork.tsx         the picture, and the menu that uploads a new one
│   ├── AvatarToast.tsx     what became of a small-avatar upload
│   ├── AddSectionButton.tsx  the sticky "Add section" beside the block
│   ├── StatBlock5e.tsx     the 2014 layout      (+ .css)
│   ├── StatBlock55e.tsx    the 2024 layout      (+ .css)
│   ├── NameRow.tsx         name, the kebab (ruleset, legendary, lair), close
│   ├── fields/             one component per field, each with its own styles
│   │   ├── registry.ts       which rows are optional, and what the "Add…" menu offers
│   │   ├── StatusChip.tsx    a checkbox as a chip, and the confirm that takes it off
│   │   ├── LegendaryChip.tsx the crown, and what goes with it
│   │   ├── LairChip.tsx      the castle, and what goes with it
│   │   └── Field.tsx         picks a row's control by which field it is
│   ├── lookup/             D&D Beyond's own browse page, as a picker
│   │   ├── lookup-context.tsx  the request an entry makes and the column answers
│   │   ├── dress-listing.ts    cutting their spell list down to rows you can click
│   │   ├── LookupFrame.tsx     the frame, its cover, and its way in and out (+ .css)
│   │   └── motion.ts           whether this author wants things to move
│   ├── prose/              the description sections, an entry at a time
│   │   ├── section-registry.ts  the sections' names, and which can be added
│   │   ├── section-items.ts     cutting a section into entries, and back again
│   │   ├── SectionList.tsx      a section as its list of entries (+ ItemGap, Merge)
│   │   ├── ProseItem.tsx        one entry: a Lexical editor, its format bar, its menus
│   │   ├── ReferenceMenu.tsx    picking a reference: what kind, then which one
│   │   ├── menu-placement.ts    where a menu hangs off what opened it
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
    ├── ref-tooltips.ts     hovering a reference, and the popup in DDB's light DOM
    ├── ref-preload.ts      warming the block's definitions before anyone hovers
    ├── ref-token.ts        reading a .ref element back into a token
    ├── slash-trigger.ts    which slashes are commands, and which are just prose
    ├── tooltip-placement.ts  where the popup goes, as arithmetic
    ├── tooltip-html.ts     DDB's tooltip markup, made safe to inject
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

npm run harvest:references   # re-reads DDB's closed-compendium ids (network)
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
