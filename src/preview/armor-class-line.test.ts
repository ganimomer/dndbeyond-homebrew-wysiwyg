import { test } from "node:test";
import assert from "node:assert/strict";
import { render5e } from "./render-5e.js";
import { render55e } from "./render-55e.js";
import { emptyMonster } from "../statblock/model.js";

// The armor class is a component (ArmorClassField); what the renderers still
// owe is where it goes, and the dependency flag around it.
for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  test(`${name} gives the armor class a place on the block`, () => {
    const block = render({ ...emptyMonster(), armorClass: { value: 16, type: "natural armor" } });

    assert.ok(block.querySelector('[data-island="armorClass"]'));
  });

  test(`${name} keeps the armor class flagged as depending on Dexterity`, () => {
    // The highlight that warns a DEX edit may have invalidated it — the only
    // signal while the chip is closed. In 5.5e it sits on the value span rather
    // than the line, which also carries Initiative.
    const block = render({ ...emptyMonster(), armorClass: { value: 16, type: "natural armor" } });
    const slot = block.querySelector('[data-island="armorClass"]')!;

    assert.ok(slot.closest('[data-dep~="dex"]'), "inside a dex-dependent element");
  });
}
