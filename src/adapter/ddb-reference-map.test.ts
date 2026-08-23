import { test } from "node:test";
import assert from "node:assert/strict";
import { refKey, refToTargets, slugify } from "./ddb-reference-map.js";

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

test("refToTargets: both spellings of a macro reach the same path", () => {
  assert.deepEqual(refToTargets({ ref: "condition", text: "Grappled" }), [
    { path: "conditions", slug: "grappled" },
  ]);
  assert.deepEqual(refToTargets({ ref: "conditions", text: "Grappled" }), [
    { path: "conditions", slug: "grappled" },
  ]);
});

test("refToTargets: [rules] is corrected to the path that exists", () => {
  // DDB's own `rules` path 404s; `rules-glossary` is the live one.
  assert.deepEqual(refToTargets({ ref: "rules", text: "Disadvantage" }), [
    { path: "rules-glossary", slug: "disadvantage" },
  ]);
});

test("refToTargets: the macro's own slug beats the display text", () => {
  assert.deepEqual(refToTargets({ ref: "rules", slug: "shape-shifting", text: "shape-shifts" }), [
    { path: "rules-glossary", slug: "shape-shifting" },
  ]);
});

test("refToTargets: [items] means a magic item *or* a piece of equipment", () => {
  // D&D Beyond writes the 2024 Gear row as `[items]Greatsword[/items]` and the
  // same macro names a Bag of Holding. The two compendiums are disjoint —
  // `/magic-items/greatsword` and `/equipment/bag-of-holding` both 404 — so
  // the macro can only be resolved by trying them.
  for (const ref of ["item", "items", "magic-item", "magic-items"]) {
    assert.deepEqual(
      refToTargets({ ref, text: "Greatsword" }).map((target) => target.path),
      ["magic-items", "weapons", "armor", "adventuring-gear"],
      ref,
    );
  }
});

test("refToTargets: a macro that does say which compendium keeps its one path", () => {
  // Only `[items]` is open. `[weapon]`, `[armor]` and `[equipment]` each name
  // one of the three, and widening them would be inviting a wrong answer.
  for (const [ref, path] of [
    ["weapon", "weapons"],
    ["armor", "armor"],
    ["equipment", "adventuring-gear"],
  ]) {
    assert.deepEqual(
      refToTargets({ ref: ref!, text: "Chain Mail" }).map((target) => target.path),
      [path],
      ref,
    );
  }
});

test("refToTargets: the macro type is matched case- and space-insensitively", () => {
  assert.equal(refToTargets({ ref: " Spells ", text: "Fireball" })[0]?.path, "spells");
});

test("refToTargets: an unknown macro type resolves to nothing", () => {
  // The codec's reference regex is generic, so anything DDB invents arrives
  // here. Answering with nothing is what keeps us from inventing a URL for it.
  assert.deepEqual(refToTargets({ ref: "sidekick", text: "Whatever" }), []);
  assert.deepEqual(refToTargets({ ref: "characters", text: "Someone" }), []);
  assert.deepEqual(refToTargets({ ref: "dicerolls", text: "1d6" }), []);
});

test("refToTargets: text that slugifies to nothing resolves to nothing", () => {
  assert.deepEqual(refToTargets({ ref: "condition", text: "   " }), []);
  assert.deepEqual(refToTargets({ ref: "condition", text: "!!!" }), []);
});

test("the three compendiums with no page of their own say where to browse", () => {
  // `/adventuring-gear/chain-mail`, `/armor/chain-mail` and `/weapons/club`
  // all 404 — D&D Beyond browses every one of them at `/equipment`, which is
  // the only place a name can be turned into an id. Without this an equipment
  // reference could never resolve at all.
  for (const macro of ["equipment", "armor", "weapon"]) {
    assert.equal(refToTargets({ ref: macro, text: "Chain Mail" })[0]?.browse, "equipment", macro);
  }
  // Everything else is browsed where it lives, and says nothing.
  assert.equal(refToTargets({ ref: "spells", text: "Fireball" })[0]?.browse, undefined);
  assert.equal(refToTargets({ ref: "condition", text: "Grappled" })[0]?.browse, undefined);
});

test("refKey: one key per reference, whatever the macro was spelled like", () => {
  // The resolver caches under it and the preloader dedupes on it, so two
  // spellings of one reference must agree and two references must not.
  assert.equal(
    refKey({ ref: "condition", text: "Grappled" }),
    refKey({ ref: "conditions", text: "Grappled" }),
  );
  assert.equal(
    refKey({ ref: "items", text: "Greatsword" }),
    refKey({ ref: "magic-item", text: "Greatsword" }),
  );
  // `[weapon]Greatsword[/weapon]` is a different question from `[items]…`: it
  // has already said which compendium, so it must not share the answer.
  assert.notEqual(
    refKey({ ref: "weapon", text: "Greatsword" }),
    refKey({ ref: "items", text: "Greatsword" }),
  );
  assert.notEqual(
    refKey({ ref: "condition", text: "Grappled" }),
    refKey({ ref: "condition", text: "Prone" }),
  );
  assert.equal(refKey({ ref: "sidekick", text: "Whatever" }), null);
});
