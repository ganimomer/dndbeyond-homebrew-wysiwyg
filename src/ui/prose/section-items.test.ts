import { test } from "node:test";
import assert from "node:assert/strict";
import { entryName, joinItems, rewriteEntryName, splitItems } from "./section-items.js";

/**
 * The split's contract is that it *partitions* — it never rewrites. Every test
 * here is ultimately about that: whatever grouping we infer, putting the pieces
 * back together has to reproduce what D&D Beyond gave us, or the next autosave
 * quietly rewrites someone's creature on the server.
 *
 * The fixtures are the shapes that actually occur in
 * `__fixtures__/monster-form.html`, plus the `<b>/<i>` shapes Lexical's exporter
 * produces once the same section has been edited once.
 */

const DDB_BOLD = `<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>`;
const LEXICAL_BOLD = `<p><i><b>Misty Escape.</b></i> It becomes mist.</p>`;
const CONTINUATION = `<p>While it has 0 Hit Points in mist form, it can't return.</p>`;

test("a bold lead-in starts an item, in D&D Beyond's own <em><strong> shape", () => {
  assert.deepEqual(splitItems(DDB_BOLD + DDB_BOLD), [DDB_BOLD, DDB_BOLD]);
});

test("and in the <b><i> shape Lexical exports after one edit", () => {
  // Both spellings turn up in the same section: DDB wrote one, we wrote the
  // other. A split that only knew <strong> would stop grouping after an edit.
  assert.deepEqual(splitItems(LEXICAL_BOLD + LEXICAL_BOLD), [LEXICAL_BOLD, LEXICAL_BOLD]);
});

test("bare <b> and bare <strong>, with no italic wrapper, lead just as well", () => {
  const bare = `<p><strong>Forbiddance.</strong> No entry without an invitation.</p>`;
  assert.deepEqual(splitItems(bare + bare), [bare, bare]);
});

test("a paragraph with no bold lead-in belongs to the item above it", () => {
  // "Misty Escape" is two paragraphs: the trait, and what happens next. They are
  // one entry on the page and have to be one row in the editor.
  assert.deepEqual(splitItems(DDB_BOLD + CONTINUATION + DDB_BOLD), [
    DDB_BOLD + CONTINUATION,
    DDB_BOLD,
  ]);
});

test("the first paragraph is always its own item, bold or not", () => {
  // Legendary Actions open with an unbolded preamble ("Legendary Action Uses:
  // 3…") that is an entry in its own right, not a continuation of nothing.
  const intro = `<p class="legendary-actions">Legendary Action Uses: 3 (4 in Lair).</p>`;
  assert.deepEqual(splitItems(intro + DDB_BOLD), [intro, DDB_BOLD]);
});

test("a section of unbolded prose stays a single item", () => {
  assert.deepEqual(splitItems(CONTINUATION + CONTINUATION), [CONTINUATION + CONTINUATION]);
});

test("an inline marker span leading a paragraph is not a bold lead-in", () => {
  // A trait that opens on a roll is a continuation, not a new entry — and more
  // to the point, descending blindly into spans would misread it.
  const rolled = `<p><span class="roll" data-roll="{}">+9</span> to hit.</p>`;
  assert.deepEqual(splitItems(DDB_BOLD + rolled), [DDB_BOLD + rolled]);
});

test("empty and blank input produce no items at all", () => {
  assert.deepEqual(splitItems(""), []);
  assert.deepEqual(splitItems("   \n  "), []);
  // What D&D Beyond leaves in a field nobody has used.
  assert.deepEqual(splitItems(`<p><br data-mce-bogus="1"></p>`), [
    `<p><br data-mce-bogus="1"></p>`,
  ]);
});

test("joining is plain concatenation", () => {
  assert.equal(joinItems([DDB_BOLD, CONTINUATION]), DDB_BOLD + CONTINUATION);
  assert.equal(joinItems([]), "");
  // An emptied row contributes nothing rather than an empty paragraph.
  assert.equal(joinItems([DDB_BOLD, "", CONTINUATION]), DDB_BOLD + CONTINUATION);
});

test("round-trip: splitting then joining reproduces the section", () => {
  // The whole point. Whatever grouping we infer, nothing may be added, dropped
  // or reordered — this is what stands between the split and a lost creature.
  for (const html of [
    DDB_BOLD + CONTINUATION + DDB_BOLD,
    LEXICAL_BOLD + DDB_BOLD + CONTINUATION,
    `<p class="legendary-actions">Uses: 3.</p>` + DDB_BOLD,
    CONTINUATION,
    `<p><strong>A.</strong></p><table><tbody><tr><td>x</td></tr></tbody></table><p><strong>B.</strong></p>`,
  ]) {
    assert.equal(joinItems(splitItems(html)), html, html);
  }
});

test("round-trip: HTML the parser normalizes comes back normalized", () => {
  // The split re-serializes through the browser's own parser, so implied tags
  // are filled in — a `<table>` written without `<tbody>` comes back with one.
  // The rendered result is identical, which is why this is tolerable, and it is
  // no worse than the section already gets: every edited section is re-exported
  // by Lexical today, which normalizes far more aggressively than this does.
  const written = `<p><strong>A.</strong></p><table><tr><td>x</td></tr></table>`;
  assert.equal(
    joinItems(splitItems(written)),
    `<p><strong>A.</strong></p><table><tbody><tr><td>x</td></tr></tbody></table>`,
  );
});

test("round-trip: whitespace between blocks is the only thing dropped", () => {
  // D&D Beyond stores its paragraphs newline-separated; Lexical exports them
  // butted together. Losing the newlines changes no rendered output, and it is
  // the one liberty the split takes.
  const spaced = `${DDB_BOLD}\n${CONTINUATION}\n${DDB_BOLD}`;
  assert.equal(joinItems(splitItems(spaced)), DDB_BOLD + CONTINUATION + DDB_BOLD);
});

test("text loose at the top level is kept, attached to its neighbour", () => {
  // Not a shape DDB writes, but dropping stray text would be data loss and the
  // partition promise has to hold for whatever a past TinyMCE session left.
  const loose = `${DDB_BOLD}tail text`;
  assert.equal(joinItems(splitItems(loose)), loose);
});

test("an entry's name is its bold lead-in, without the full stop", () => {
  assert.equal(entryName(DDB_BOLD), "Misty Escape");
  assert.equal(entryName(LEXICAL_BOLD), "Misty Escape");
});

test("a name keeps whatever the author put in parentheses", () => {
  // "Legendary Resistance (3/Day)" is one name, and the count is the part
  // anyone looking for it cares about.
  const trait = `<p><em><strong>Legendary Resistance (3/Day).</strong></em> It succeeds instead.</p>`;
  assert.equal(entryName(trait), "Legendary Resistance (3/Day)");
});

test("an entry with no bold lead-in has no name", () => {
  // The Legendary Actions preamble: an entry, but not a named one.
  const intro = `<p class="legendary-actions">Legendary Action Uses: 3 (4 in Lair).</p>`;
  assert.equal(entryName(intro), "");
  assert.equal(entryName(""), "");
});

test("only the first block names the entry", () => {
  // The continuation below it is part of the same entry and says nothing about
  // what the entry is called.
  assert.equal(entryName(DDB_BOLD + CONTINUATION), "Misty Escape");
});

// --- renaming an entry ------------------------------------------------------

/** The shape an entry comes back in once Lexical has exported it once. */
const EXPORTED = `<p><i><b><strong style="white-space: pre-wrap;">Legendary Resistance (3/Day).</strong></b></i> It succeeds instead.</p>`;

const shout = (name: string) => name.toUpperCase();

test("renaming an entry changes the name and nothing else", () => {
  assert.equal(
    entryName(rewriteEntryName(DDB_BOLD, shout)),
    "MISTY ESCAPE",
  );
  assert.match(rewriteEntryName(DDB_BOLD, shout), /It becomes mist\.<\/p>$/);
});

test("the markup around the name survives the rename untouched", () => {
  // An entry that has been through Lexical carries `<i><b><strong style=…>`.
  // Setting `textContent` anywhere up that chain would flatten it into
  // something that renders the same and diffs differently.
  const renamed = rewriteEntryName(EXPORTED, (name) => name.replace("(3/Day)", "(4/Day)"));
  assert.match(renamed, /<i><b><strong style="white-space: pre-wrap;">Legendary Resistance \(4\/Day\)\.<\/strong><\/b><\/i>/);
});

test("a renamed entry is still one entry", () => {
  // It has to keep leading with bold, or the section would fold it into
  // whatever sits above it on the next split.
  const renamed = rewriteEntryName(DDB_BOLD, shout);
  assert.deepEqual(splitItems(renamed + DDB_BOLD), [renamed, DDB_BOLD]);
  assert.equal(joinItems(splitItems(renamed)), renamed);
});

test("a rewrite that declines leaves the entry exactly as it came in", () => {
  assert.equal(rewriteEntryName(DDB_BOLD, () => null), DDB_BOLD);
});

test("an entry with no bold lead-in has no name to rewrite", () => {
  const intro = `<p class="legendary-actions">Legendary Action Uses: 3 (4 in Lair).</p>`;
  assert.equal(rewriteEntryName(intro, shout), intro);
});
