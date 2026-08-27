import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster } from "./model.js";
import {
  armorBonus,
  armorClassText,
  hintParts,
  hintText,
  shieldChange,
  unarmoredAc,
  withHintPart,
  withoutHintPart,
} from "./armor-class.js";

const withDex = (dex: number): Monster => {
  const monster = emptyMonster();
  return { ...monster, abilities: { ...monster.abilities, dex } };
};

test("prints the armor class with its type in parentheses", () => {
  assert.equal(armorClassText({ value: 16, type: "natural armor" }), "16 (natural armor)");
});

test("prints a bare number when there's no type", () => {
  assert.equal(armorClassText({ value: 16, type: "" }), "16");
});

test("the unarmored class is 10 plus the Dexterity modifier", () => {
  assert.equal(unarmoredAc(withDex(18)), 14);
  assert.equal(unarmoredAc(withDex(10)), 10);
  assert.equal(unarmoredAc(withDex(6)), 8);
});

test("the armor bonus is whatever the class carries above unarmored", () => {
  assert.equal(armorBonus(16, 14), 2);
  assert.equal(armorBonus(16, 12), 4);
  // A creature whose class is worse than its Dexterity alone would give.
  assert.equal(armorBonus(11, 14), -3);
});

test("a qualifier naming one thing is one part", () => {
  assert.deepEqual(hintParts("natural armor"), ["natural armor"]);
  assert.deepEqual(hintParts("  splint  "), ["splint"]);
  assert.deepEqual(hintParts(""), []);
});

test("a qualifier naming several reads the same with or without the Oxford comma", () => {
  assert.deepEqual(hintParts("studded leather and shield"), ["studded leather", "shield"]);
  assert.deepEqual(hintParts("plate, shield and a ring"), ["plate", "shield", "a ring"]);
  assert.deepEqual(hintParts("plate, shield, and a ring"), ["plate", "shield", "a ring"]);
  // A bare comma list, which is how some stat blocks write it.
  assert.deepEqual(hintParts("plate, shield"), ["plate", "shield"]);
});

test("parts go back together the way a stat block writes them", () => {
  assert.equal(hintText([]), "");
  assert.equal(hintText(["splint"]), "splint");
  assert.equal(hintText(["splint", "shield"]), "splint and shield");
  assert.equal(hintText(["plate", "shield", "a ring"]), "plate, shield, and a ring");
});

test("a part joins the end of the qualifier, and only once", () => {
  assert.equal(withHintPart("studded leather", "shield"), "studded leather and shield");
  assert.equal(withHintPart("", "shield"), "shield");
  // Already there — in whatever spelling the author used.
  assert.equal(withHintPart("splint and shield", "shield"), "splint and shield");
  assert.equal(withHintPart("Splint and Shield", "shield"), "Splint and Shield");
});

test("a part leaves the qualifier without disturbing the rest", () => {
  assert.equal(withoutHintPart("studded leather and shield", "shield"), "studded leather");
  assert.equal(withoutHintPart("plate, shield, and a ring", "shield"), "plate and a ring");
  assert.equal(withoutHintPart("Shield", "shield"), "");
  // Not there to begin with.
  assert.equal(withoutHintPart("natural armor", "shield"), "natural armor");
});

test("a shield joining the gear offers two points and says so", () => {
  assert.deepEqual(shieldChange({ value: 17, type: "splint" }, false, true), {
    value: 19,
    type: "splint and shield",
  });
  // A creature whose armor the editor has never heard of is offered the same.
  assert.deepEqual(shieldChange({ value: 16, type: "natural armor" }, false, true), {
    value: 18,
    type: "natural armor and shield",
  });
  assert.deepEqual(shieldChange({ value: 13, type: "" }, false, true), {
    value: 15,
    type: "shield",
  });
});

test("a shield leaving the gear offers the two points back", () => {
  assert.deepEqual(shieldChange({ value: 19, type: "splint and shield" }, true, false), {
    value: 17,
    type: "splint",
  });
});

test("a shield the block already accounts for is offered nothing", () => {
  assert.equal(shieldChange({ value: 19, type: "splint and shield" }, false, true), null);
  // And one it never accounted for has nothing to give back.
  assert.equal(shieldChange({ value: 17, type: "splint" }, true, false), null);
});

test("gear that gained no shield and lost none offers nothing", () => {
  assert.equal(shieldChange({ value: 17, type: "splint" }, false, false), null);
  assert.equal(shieldChange({ value: 19, type: "splint and shield" }, true, true), null);
});
