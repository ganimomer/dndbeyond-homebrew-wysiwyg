import { test } from "node:test";
import assert from "node:assert/strict";
import { joinItems, splitItems } from "./section-items.js";

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
