import { test } from "node:test";
import assert from "node:assert/strict";
import { MUNDANE_ARMOR, SHIELD, armorAc, armorByName, armorFor } from "./armor.js";

const armor = (name: string) => {
  const found = armorByName(name);
  assert.ok(found, `no armor named ${name}`);
  return found;
};

test("heavy armor ignores Dexterity entirely", () => {
  // Splint is a flat 17 whether the creature is nimble or not.
  assert.equal(armorAc(armor("Splint Armor"), 1), 17);
  assert.equal(armorAc(armor("Splint Armor"), 5), 17);
  assert.equal(armorAc(armor("Splint Armor"), -1), 17);
  assert.equal(armorAc(armor("Chain Mail"), 3), 16);
  assert.equal(armorAc(armor("Plate Armor"), 3), 18);
});

test("medium armor takes at most two points of Dexterity", () => {
  assert.equal(armorAc(armor("Half Plate Armor"), 1), 16);
  // The cap: a DEX 20 creature gets 2, not 5.
  assert.equal(armorAc(armor("Half Plate Armor"), 5), 17);
  assert.equal(armorAc(armor("Half Plate Armor"), 2), 17);
  // A penalty is not capped — it is not a bonus.
  assert.equal(armorAc(armor("Hide Armor"), -1), 11);
});

test("light armor takes the whole Dexterity modifier", () => {
  assert.equal(armorAc(armor("Leather Armor"), 5), 16);
  assert.equal(armorAc(armor("Studded Leather Armor"), 3), 15);
  assert.equal(armorAc(armor("Padded Armor"), -1), 10);
});

test("the twelve mundane body armors are all there, and nothing else", () => {
  assert.equal(MUNDANE_ARMOR.length, 12);
  // A shield is worn *alongside* body armor rather than instead of it, so it is
  // deliberately out of the table "Replace…" offers.
  assert.equal(armorByName("Shield"), undefined);
  assert.equal(armorFor({ text: "Shield", slug: "shield" }), undefined);
});

test("a shield is worth two points", () => {
  assert.equal(SHIELD.bonus, 2);
});

test("recognises a reference by the name D&D Beyond displays", () => {
  assert.equal(armorFor({ text: "Chain Mail" })?.base, 16);
  assert.equal(armorFor({ text: "Splint Armor" })?.base, 17);
  // Case and stray whitespace are the author's, not the table's.
  assert.equal(armorFor({ text: "  splint armor " })?.base, 17);
});

test("recognises a reference by the slug the macro carries", () => {
  // D&D Beyond's own Warrior Veteran gear: [items]splint;Splint Armor[/items].
  assert.equal(armorFor({ text: "Splint Armor", slug: "splint" })?.base, 17);
  // And the slug alone, where the display text has been reworded.
  assert.equal(armorFor({ text: "his rusted mail", slug: "chain-mail" })?.base, 16);
  assert.equal(armorFor({ text: "Half Plate", slug: "half-plate" })?.base, 15);
});

test("gear that is not armor is not armor", () => {
  assert.equal(armorFor({ text: "Greatsword" }), undefined);
  assert.equal(armorFor({ text: "Heavy Crossbow", slug: "crossbow, heavy" }), undefined);
  assert.equal(armorFor({ text: "" }), undefined);
});

test("every armor's qualifier is something the AC row can print", () => {
  for (const entry of [...MUNDANE_ARMOR, SHIELD]) {
    // DDB's armor-class-type input rejects anything under two characters.
    assert.ok(entry.qualifier.length >= 2, entry.name);
    assert.equal(entry.qualifier, entry.qualifier.toLowerCase());
  }
});
