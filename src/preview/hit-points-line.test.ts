import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// The renderers build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render5e } = await import("./render-5e.js");
const { render55e } = await import("./render-55e.js");
const { emptyMonster } = await import("../statblock/model.js");

const VAMPIRE = { average: 195, dieCount: 23, dieValue: 8, modifier: 92 };

for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  test(`${name} makes the hit points one clickable chip`, () => {
    const block = render({ ...emptyMonster(), hitPoints: VAMPIRE });
    const chips = block.querySelector('.sb-chips[data-field="hitPoints"]');

    assert.ok(chips, "hit-points chip container is present");
    const button = chips!.querySelector<HTMLButtonElement>(".sb-chip-button");
    assert.ok(button, "the value itself is the button");
    assert.match(button!.textContent ?? "", /^195 \(23d8 \+ 92\)$/);
  });

  test(`${name} keeps the hit-points line flagged as depending on Constitution`, () => {
    // The line carries the highlight that tells the user a CON edit may have
    // invalidated it — the only signal while the chip is closed.
    const block = render({ ...emptyMonster(), hitPoints: VAMPIRE });
    const chips = block.querySelector('.sb-chips[data-field="hitPoints"]');

    assert.equal(chips!.closest(".line")?.dataset.dep, "con");
  });
}
