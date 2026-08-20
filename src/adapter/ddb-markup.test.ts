import { test } from "node:test";
import assert from "node:assert/strict";
import { ddbToEditorHtml, editorHtmlToDdb } from "./ddb-markup.js";

/**
 * The codec's contract is a *lossless* round-trip for well-formed DDB macros:
 * decode (DDB → editor spans) then encode (spans → DDB) must reproduce the
 * original, so write-back never corrupts a roll's JSON payload or a reference's
 * slug/type. These fixtures mirror the shapes DDB stores in its
 * `field-*-description-wysiwyg` textareas.
 */

const ROLL = `[rollable]+9;{"diceNotation":"1d20+9","rollType":"to hit"}[/rollable]`;
const ROLL_NO_PAYLOAD = `[rollable]+9[/rollable]`;
const REF_NO_SLUG = `[condition]Grappled[/condition]`;
const REF_SLUG = `[rules]shape-shifting;Shape-Shift[/rules]`;

test("decode: roll with payload becomes a roll span carrying the JSON", () => {
  const out = ddbToEditorHtml(`<p>${ROLL} to hit</p>`);
  assert.match(out, /<span class="roll" data-roll="[^"]+">\+9<\/span>/);
  assert.match(out, /data-roll="[^"]*diceNotation[^"]*"/);
  assert.ok(!out.includes("[rollable]"));
});

test("decode: reference keeps its type and slug as data attributes", () => {
  const out = ddbToEditorHtml(`<p>${REF_SLUG}</p>`);
  assert.equal(
    out,
    `<p><span class="ref" data-ref="rules" data-slug="shape-shifting">Shape-Shift</span></p>`,
  );
});

test("decode: reference without a slug omits data-slug", () => {
  const out = ddbToEditorHtml(`<p>${REF_NO_SLUG}</p>`);
  assert.equal(out, `<p><span class="ref" data-ref="condition">Grappled</span></p>`);
});

test("decode: stray unpaired macro tags are dropped (as DDB renders them)", () => {
  assert.equal(ddbToEditorHtml(`<p>mist [hover] form</p>`), `<p>mist form</p>`);
});

const ROUND_TRIP_FIXTURES: Array<[string, string]> = [
  ["roll with payload", `<p>${ROLL} to hit</p>`],
  ["roll without payload", `<p>${ROLL_NO_PAYLOAD} to hit</p>`],
  ["reference with slug", `<p>${REF_SLUG}</p>`],
  ["reference without slug", `<p>${REF_NO_SLUG}</p>`],
  [
    "mixed formatting, roll, and reference",
    `<p><em>Melee Attack Roll:</em> ${ROLL}, reach 5 ft. It has the ${REF_NO_SLUG} condition.</p>`,
  ],
  [
    "multiple rolls in one line",
    `<p><em>Hit:</em> 8 ${ROLL} Bludgeoning plus 7 ${ROLL} Necrotic.</p>`,
  ],
];

for (const [name, ddb] of ROUND_TRIP_FIXTURES) {
  test(`round-trip is byte-stable: ${name}`, () => {
    assert.equal(editorHtmlToDdb(ddbToEditorHtml(ddb)), ddb);
  });
}

test("encode: a plain span the editor produced without markers is left alone", () => {
  const html = `<p>just <strong>bold</strong> text</p>`;
  assert.equal(editorHtmlToDdb(html), html);
});
