import { test } from "node:test";
import assert from "node:assert/strict";
import { metaLine, typeLine } from "./compute.js";
import { sampleVampire5e, sampleVampire55e } from "./sample.js";
import { emptyMonster } from "./model.js";

/**
 * Guards the meta line: composed purely from the discrete size / type / subType
 * / alignment fields (no `metaOverride`), it must read exactly as before.
 */

test("typeLine composes type + subtypes parenthetically", () => {
  assert.equal(typeLine({ ...emptyMonster(), type: "humanoid", subTypes: ["elf"] }), "humanoid (elf)");
  assert.equal(
    typeLine({ ...emptyMonster(), type: "humanoid", subTypes: ["elf", "shapechanger"] }),
    "humanoid (elf, shapechanger)",
  );
  assert.equal(typeLine({ ...emptyMonster(), type: "humanoid", subTypes: [] }), "humanoid");
});

test("5e sample meta line reads with its subtype", () => {
  assert.equal(metaLine(sampleVampire5e()), "Medium undead (shapechanger), lawful evil");
});

test("free-form size composes without an override (5.5e sample)", () => {
  assert.equal(metaLine(sampleVampire55e()), "Medium or Small Undead, Lawful Evil");
});
