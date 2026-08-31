import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_ABILITY, skillBonus } from "./skills.js";
import { emptyMonster } from "./model.js";

test("every 5e skill has a governing ability", () => {
  assert.equal(Object.keys(SKILL_ABILITY).length, 18);
  assert.equal(SKILL_ABILITY.Stealth, "dex");
  assert.equal(SKILL_ABILITY.Perception, "wis");
  assert.equal(SKILL_ABILITY["Sleight of Hand"], "dex");
  assert.equal(SKILL_ABILITY["Animal Handling"], "wis");
});

test("skillBonus is the ability modifier plus the proficiency bonus", () => {
  const monster = { ...emptyMonster(), challengeRating: "5" }; // PB +3
  monster.abilities = { ...monster.abilities, wis: 16, dex: 8 };

  assert.equal(skillBonus(monster, "Perception"), 6); // +3 mod, +3 PB
  assert.equal(skillBonus(monster, "Stealth"), 2); // −1 mod, +3 PB
});

test("skillBonus follows the CR's proficiency bonus", () => {
  const base = { ...emptyMonster() };
  base.abilities = { ...base.abilities, dex: 18 }; // +4

  assert.equal(skillBonus({ ...base, challengeRating: "1/2" }, "Acrobatics"), 6); // PB +2
  assert.equal(skillBonus({ ...base, challengeRating: "13" }, "Acrobatics"), 9); // PB +5
});

test("an unknown skill has no derivable bonus", () => {
  assert.equal(skillBonus(emptyMonster(), "Basket Weaving"), undefined);
});
