/**
 * Reading D&D Beyond's rendered stat block back into the editor's markup.
 *
 * The pairs below are the two halves of one round trip: what the form stores,
 * and what the monster page renders it as. What matters is that going from the
 * page back through `editorHtmlToDdb` lands on the macro the form had — that is
 * what makes an imported entry indistinguishable from a typed one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsToEditorHtml } from "./ddb-details.js";
import { ddbToEditorHtml, editorHtmlToDdb } from "./ddb-markup.js";

/** Page markup → the macro the form would have stored. */
const asMacro = (html: string) => editorHtmlToDdb(detailsToEditorHtml(html));

test("a rendered rollable becomes the roll it was", () => {
  const rendered =
    '<p><span data-dicenotation="1d20+9" data-rolltype="to hit" data-rollaction="Bite">+9</span> to hit</p>';
  assert.equal(
    asMacro(rendered),
    '<p>[rollable]+9;{"diceNotation":"1d20+9","rollType":"to hit","rollAction":"Bite"}[/rollable] to hit</p>',
  );
});

test("a damage roll keeps its damage type, and one without has no key for it", () => {
  const damage =
    '<span data-dicenotation="1d6+4" data-rolltype="damage" data-rollaction="Bite" data-rolldamagetype="piercing">(1d6 + 4)</span>';
  assert.match(asMacro(damage), /"rollDamageType":"piercing"/);
  const flat = '<span data-dicenotation="3d6" data-rolltype="damage" data-rollaction="Bite">(3d6)</span>';
  assert.ok(!asMacro(flat).includes("rollDamageType"), "not an empty one");
});

test("the payload survives a whole round trip through the form's own codec", () => {
  const rendered =
    '<span data-dicenotation="1d8+4" data-rolltype="damage" data-rollaction="Grave Strike" data-rolldamagetype="Bludgeoning">(1d8 + 4)</span>';
  const editor = detailsToEditorHtml(rendered);
  assert.equal(ddbToEditorHtml(editorHtmlToDdb(editor)), editor);
});

test("a rendered reference becomes the macro its compendium is spelled with", () => {
  const condition =
    '<a class="tooltip-hover condition-tooltip" href="/sources/dnd/free-rules/rules-glossary#GrappledCondition" data-tooltip-href="/conditions/6-tooltip">grappled</a>';
  assert.equal(asMacro(condition), "[condition]grappled[/condition]");
  const monster =
    '<a class="tooltip-hover monster-tooltip" href="/monsters/17044-vampire-spawn" data-tooltip-href="/monsters/17044-tooltip">vampire spawn</a>';
  assert.equal(asMacro(monster), "[monsters]vampire spawn[/monsters]");
});

test("the tooltip attribute is read in both shapes the page wears it in", () => {
  // As the server writes it, and as D&D Beyond's own script rewrites it once
  // the page runs — which is the one the frame actually reads.
  const served = '<a data-tooltip-href="/conditions/6-tooltip">grappled</a>';
  const live =
    '<a data-tooltip-href="//www.dndbeyond.com/conditions/6-tooltip?disable-webm=1&amp;disable-webm=1">grappled</a>';
  assert.equal(asMacro(served), "[condition]grappled[/condition]");
  assert.equal(asMacro(live), "[condition]grappled[/condition]");
});

test("the tooltip's id is not a slug, and isn't written as one", () => {
  const spell =
    '<a class="tooltip-hover spell-tooltip" data-tooltip-href="/spells/2062-tooltip">fireball</a>';
  assert.equal(detailsToEditorHtml(spell), '<span class="ref" data-ref="spells">fireball</span>');
});

test("a link that isn't a reference keeps its words and loses its link", () => {
  // DDB links a source book, a habitat tag and its own legacy notice the same
  // way it links a condition; only the tooltip path says which is which.
  const source = '<p>See <a href="/sources/dnd/mm/vampires">the Monster Manual</a>.</p>';
  assert.equal(detailsToEditorHtml(source), "<p>See the Monster Manual.</p>");
  const unknown =
    '<p>A <a class="tooltip-hover" data-tooltip-href="/backgrounds/3-tooltip">sailor</a>.</p>';
  assert.equal(detailsToEditorHtml(unknown), "<p>A sailor.</p>");
});

test("formatting is kept, everything else about the page is not", () => {
  const entry =
    '<p class="mon-p" id="x"><em><strong>Bite.</strong></em> <i>Hit:</i> 7 damage.</p>';
  assert.equal(
    detailsToEditorHtml(entry),
    "<p><em><strong>Bite.</strong></em> <i>Hit:</i> 7 damage.</p>",
  );
});

test("what the page can carry and the editor can't is unwrapped or dropped", () => {
  assert.equal(detailsToEditorHtml("<div><p>Kept.</p></div>"), "<p>Kept.</p>");
  assert.equal(detailsToEditorHtml("<p>Kept.</p><script>alert(1)</script>"), "<p>Kept.</p>");
  assert.equal(detailsToEditorHtml('<p>Kept.<button class="mb-import">x</button></p>'), "<p>Kept.</p>");
});

test("a marker span the page didn't write is only a span", () => {
  // Belt and braces: nothing off the page is trusted to already be ours.
  assert.equal(
    detailsToEditorHtml('<span class="roll" data-roll="{}">+9</span>'),
    "<span>+9</span>",
  );
});
