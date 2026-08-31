# Microbrewery

[![CI](https://github.com/ganimomer/dndbeyond-homebrew-wysiwyg/actions/workflows/ci.yml/badge.svg)](https://github.com/ganimomer/dndbeyond-homebrew-wysiwyg/actions/workflows/ci.yml)

A browser extension that turns the [D&D Beyond](https://www.dndbeyond.com)
homebrew **monster** builder into a WYSIWYG editor. It adds an **"Open in
Microbrewery"** button to the editor page; opening it covers the form with a
live stat block that looks like the finished creature and is edited in place.

Built Firefox-first, on a browser-agnostic core with a thin per-browser layer.

## What it does

- **Renders the real thing.** Either D&D Beyond layout — the 2024 `5.5e` design
  or the classic `5e` one, picked by the creature's ruleset — in their own
  colors, fonts and frame. Optional rows print only when the creature has them.
- **Every field is editable**, from the name to the last tidbit, writing back to
  D&D Beyond's form as you go.
- **Descriptions are rich text**, edited an entry at a time: a blank line ends a
  trait and starts the next, the gap between two offers to merge them, and a
  drag handle moves one within its section or into another.
- **References hover to D&D Beyond's own definitions** — a condition, a spell, a
  glossary term — and **`/`** inserts a new one, including spells, monsters and
  items picked off their own browse page, framed beside the block.
- **Sections and rows come and go.** Anything the creature has no text for isn't
  printed; "Add section" and the "Add…" menu put it back. The kebab makes a
  creature legendary or gives it a lair, checkbox and all.
- **Autosave** persists all of it without a page reload.

## Install

There's no store listing yet, so it's loaded unpacked.

**Firefox**

1. `npm install && npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…** → pick `dist/firefox/manifest.json`

**Chrome / Edge**

1. `npm install && npm run build:chrome`
2. Go to `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → pick the `dist/chrome` folder

## Using it

Open one of your homebrew monsters for editing
(`…/homebrew/creations/monsters/<id>/edit`) and click **Open in Microbrewery**,
bottom-right.

## Status

Working end-to-end against the live page: the read of the editor form, the
2014/2024 rendering, editing every field and every description section, and
autosave. Not on either store yet — see
[CONTRIBUTING.md](CONTRIBUTING.md#publishing-to-the-stores) for what that needs.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the build, the checks, how the code is
laid out and how a release is cut. [BUILDING.md](BUILDING.md) is the narrower
one: rebuilding a shipped archive from source, which is what an add-on reviewer
is handed.

## License

[MIT](LICENSE).

Not affiliated with, endorsed by, or connected to Wizards of the Coast or D&D
Beyond. "D&D Beyond" and "Dungeons & Dragons" are their trademarks, used here
only to say what this edits.
