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

    assert.equal(block.querySelector('.sb-chips[data-field="skills"]'), null);
  });

  test(`${name} renders the Skills row with its "+" once revealed`, () => {
    const block = render(
      { ...emptyMonster(), skills: {} },
      { revealed: new Set(["skills" as const]) },
    );
    const chips = block.querySelector('.sb-chips[data-field="skills"]');

    assert.ok(chips, "skills chip container is present");
    assert.equal(chips!.querySelectorAll(".sb-chip").length, 0);
    assert.ok(chips!.querySelector(".sb-chip-add"), "add affordance is present");
    assert.equal(chips!.closest(".line")?.dataset.dep, "all");
  });

  test(`${name} renders a chip per skill`, () => {
    const block = render({ ...emptyMonster(), skills: { Perception: 7, Stealth: -1 } });
    const row = block.querySelector('.sb-chips[data-field="skills"]')!;
    const chips = [...row.querySelectorAll(".sb-chip")].map((c) => c.textContent);

    assert.deepEqual(chips, ["Perception +7×", "Stealth −1×"]);
  });
}
