import { test } from "node:test";
import assert from "node:assert/strict";
// The DOM these renderers build against is installed process-wide by
// scripts/dom-setup.mjs, so this needs no jsdom preamble of its own.
import { render5e } from "./render-5e.js";
import { render55e } from "./render-55e.js";
import { emptyMonster } from "../statblock/model.js";

for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  // A skill-less creature prints no Skills row at all, the way a real stat
  // block does; the "Add…" menu at the foot of the section is what brings it
  // back (see optional-fields.test.ts).
  test(`${name} drops the Skills row when there are no skills`, () => {
    const block = render({ ...emptyMonster(), skills: {} });

    assert.equal(block.querySelector('[data-island="skills"]'), null);
  });

  // Skills is a component now, so what the renderer owes is the hole it goes in
  // and the row it hangs off; the chips are SkillsRow.test.tsx's business.
  test(`${name} renders the Skills row once revealed`, () => {
    const block = render(
      { ...emptyMonster(), skills: {} },
      { revealed: new Set(["skills" as const]) },
    );
    const slot = block.querySelector('[data-island="skills"]');

    assert.ok(slot, "leaves the field a place");
    // Every skill bonus moves with its governing ability score.
    assert.equal(slot!.closest(".line")?.dataset.dep, "all");
  });

  test(`${name} makes room for the row when the creature has skills`, () => {
    const block = render({ ...emptyMonster(), skills: { Perception: 7, Stealth: -1 } });

    assert.ok(block.querySelector('[data-island="skills"]'));
  });
}
