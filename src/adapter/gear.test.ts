import { test } from "node:test";
import assert from "node:assert/strict";
import { gearHasShield } from "./gear.js";

/** D&D Beyond's own Warrior Veteran, whose gear carries no shield. */
const VETERAN =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

test("finds the shield the Equipment listing writes", () => {
  // What `rowTarget` produces for a row whose icon says `equipment-shield`.
  assert.equal(gearHasShield(`${VETERAN}, [armor]Shield[/armor]`), true);
});

test("finds the shield D&D Beyond's own creatures write", () => {
  assert.equal(gearHasShield(`[items]shield;Shield[/items], ${VETERAN}`), true);
});

test("finds one the author has reworded, by the slug it still carries", () => {
  assert.equal(gearHasShield("[items]shield;his father's battered kite[/items]"), true);
});

test("gear without a shield has no shield", () => {
  assert.equal(gearHasShield(VETERAN), false);
  assert.equal(gearHasShield(""), false);
  // Plain words are not a reference: nothing points at the compendium.
  assert.equal(gearHasShield("a shield"), false);
});

test("the spell Shield is not a shield", () => {
  assert.equal(gearHasShield("[spells]Shield[/spells]"), false);
});

test("finds one the author typed rather than picked", () => {
  // The Equipment filter's "type the name exactly" route, which cannot know
  // that D&D Beyond files a shield under armor rather than adventuring gear.
  assert.equal(gearHasShield("[equipment]Shield[/equipment]"), true);
});
