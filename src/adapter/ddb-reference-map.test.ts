import { test } from "node:test";
import assert from "node:assert/strict";
import { refToTarget, slugify } from "./ddb-reference-map.js";

/**
 * The half of a reference lookup that needs no network. Everything here is a
 * fact about D&D Beyond's own URL spellings, checked against live ones:
 * `shape-shifting`, `detect-magic`, `vampire-spawn`, `wand-of-magic-missiles`.
 */

test("slugify: spaces and case become a dashed lowercase slug", () => {
  assert.equal(slugify("Detect Magic"), "detect-magic");
  assert.equal(slugify("Wand of Magic Missiles"), "wand-of-magic-missiles");
});

test("slugify: apostrophes vanish rather than splitting the word", () => {
  assert.equal(slugify("Bigby's Hand"), "bigbys-hand");
  assert.equal(slugify("Bigby’s Hand"), "bigbys-hand");
});

test("slugify: a run of punctuation collapses to one dash", () => {
  assert.equal(slugify("Shape-Shifting"), "shape-shifting");
  assert.equal(slugify("Dragon's  Breath!"), "dragons-breath");
});

test("slugify: diacritics are folded away", () => {
  assert.equal(slugify("Déjà Vu"), "deja-vu");
});

test("slugify: surrounding whitespace and dashes are trimmed", () => {
  assert.equal(slugify("  Charmed \n"), "charmed");
  assert.equal(slugify("--Prone--"), "prone");
});

test("refToTarget: both spellings of a macro reach the same path", () => {
  assert.deepEqual(refToTarget({ ref: "condition", text: "Grappled" }), {
    path: "conditions",
    slug: "grappled",
  });
  assert.deepEqual(refToTarget({ ref: "conditions", text: "Grappled" }), {
    path: "conditions",
    slug: "grappled",
  });
});

test("refToTarget: [rules] is corrected to the path that exists", () => {
  // DDB's own `rules` path 404s; `rules-glossary` is the live one.
  assert.deepEqual(refToTarget({ ref: "rules", text: "Disadvantage" }), {
    path: "rules-glossary",
    slug: "disadvantage",
  });
});

test("refToTarget: the macro's own slug beats the display text", () => {
  assert.deepEqual(
    refToTarget({ ref: "rules", slug: "shape-shifting", text: "shape-shifts" }),
    { path: "rules-glossary", slug: "shape-shifting" },
  );
});

test("refToTarget: item spellings all land on magic-items", () => {
  for (const ref of ["item", "items", "magic-item", "magic-items"]) {
    assert.equal(refToTarget({ ref, text: "Bag of Holding" })?.path, "magic-items");
  }
});

test("refToTarget: the macro type is matched case- and space-insensitively", () => {
  assert.equal(refToTarget({ ref: " Spells ", text: "Fireball" })?.path, "spells");
});

test("refToTarget: an unknown macro type resolves to nothing", () => {
  // The codec's reference regex is generic, so anything DDB invents arrives
  // here. Returning null is what keeps us from inventing a URL for it.
  assert.equal(refToTarget({ ref: "sidekick", text: "Whatever" }), null);
  assert.equal(refToTarget({ ref: "characters", text: "Someone" }), null);
  assert.equal(refToTarget({ ref: "dicerolls", text: "1d6" }), null);
});

test("refToTarget: text that slugifies to nothing resolves to nothing", () => {
  assert.equal(refToTarget({ ref: "condition", text: "   " }), null);
  assert.equal(refToTarget({ ref: "condition", text: "!!!" }), null);
});

test("the three compendiums with no page of their own say where to browse", () => {
  // `/adventuring-gear/chain-mail`, `/armor/chain-mail` and `/weapons/club`
  // all 404 — D&D Beyond browses every one of them at `/equipment`, which is
  // the only place a name can be turned into an id. Without this an equipment
  // reference could never resolve at all.
  for (const macro of ["equipment", "armor", "weapon"]) {
    assert.equal(refToTarget({ ref: macro, text: "Chain Mail" })?.browse, "equipment", macro);
  }
  // Everything else is browsed where it lives, and says nothing.
  assert.equal(refToTarget({ ref: "spells", text: "Fireball" })?.browse, undefined);
  assert.equal(refToTarget({ ref: "condition", text: "Grappled" })?.browse, undefined);
});
