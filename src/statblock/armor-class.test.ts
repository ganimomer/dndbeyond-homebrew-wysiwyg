import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster } from "./model.js";
import { armorBonus, armorClassText, unarmoredAc } from "./armor-class.js";

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
