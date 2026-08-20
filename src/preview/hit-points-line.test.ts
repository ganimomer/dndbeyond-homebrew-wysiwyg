import { test } from "node:test";
import assert from "node:assert/strict";
import { render5e } from "./render-5e.js";
import { render55e } from "./render-55e.js";
import { emptyMonster } from "../statblock/model.js";

// Hit points are a component (HitPointsField); what the renderers still owe is
// where it goes, and the dependency flag around it.
for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  test(`${name} gives the hit points a place on the block`, () => {
    const block = render({
      ...emptyMonster(),
      hitPoints: { average: 195, dieCount: 23, dieValue: 8, modifier: 92 },
    });

    assert.ok(block.querySelector('[data-island="hitPoints"]'));
  });

  test(`${name} keeps the hit-points line flagged as depending on Constitution`, () => {
    // The line carries the highlight that tells the user a CON edit may have
    // invalidated it — the only signal while the chip is closed.
    const block = render({
      ...emptyMonster(),
      hitPoints: { average: 195, dieCount: 23, dieValue: 8, modifier: 92 },
    });
    const slot = block.querySelector('[data-island="hitPoints"]')!;

    assert.equal(slot.closest(".line")?.dataset.dep, "con");
  });
}
