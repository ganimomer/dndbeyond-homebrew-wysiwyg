import { test } from "node:test";
import assert from "node:assert/strict";
import { ddbTextToEditorHtml, editorHtmlToDdbText } from "./ddb-text.js";

/** The Gear field of D&D Beyond's own Warrior Veteran, verbatim. */
const GEAR =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

test("a plain field's macros become the same marker spans the prose uses", () => {
  const html = ddbTextToEditorHtml(GEAR);

  assert.match(html, /^<p>/, "one paragraph, because the field is one line");
  assert.ok(
    html.includes(`<span class="ref" data-ref="items">Greatsword</span>`),
    `expected a bare reference, got: ${html}`,
  );
  assert.ok(
    html.includes(`<span class="ref" data-ref="items" data-slug="splint">Splint Armor</span>`),
    `expected a slugged reference, got: ${html}`,
  );
  assert.ok(!html.includes("[items]"), "and nothing left that reads as markup");
});

test("the value comes back byte-for-byte", () => {
  assert.equal(editorHtmlToDdbText(ddbTextToEditorHtml(GEAR)), GEAR);
});

test("an empty field is empty, not an empty paragraph", () => {
  assert.equal(ddbTextToEditorHtml(""), "");
  assert.equal(ddbTextToEditorHtml("   "), "");
});

test("text that reads as markup is text", () => {
  // Nothing on a stat block writes this, but an author can type it, and an
  // unescaped `<` would swallow the rest of the row.
  const html = ddbTextToEditorHtml("a < b & c");

  assert.ok(html.includes("&lt;") && html.includes("&amp;"), `got: ${html}`);
  assert.equal(editorHtmlToDdbText(html), "a < b & c");
});

test("what a one-line field can't hold is flattened, not dropped", () => {
  // An author can paste anything. Paragraphs and line breaks become the single
  // space that keeps the words either side of them apart.
  assert.equal(
    editorHtmlToDdbText("<p>Greatsword,<br>Shield</p><p>Splint Armor</p>"),
    "Greatsword, Shield Splint Armor",
  );
  assert.equal(editorHtmlToDdbText("<p>a <strong>bold</strong> word</p>"), "a bold word");
});

test("an emptied box commits an empty value", () => {
  assert.equal(editorHtmlToDdbText("<p><br></p>"), "");
});
