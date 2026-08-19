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

for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  // Unlike the other tidbits, the Skills row can't be dropped when empty: the
  // "＋" that adds the creature's first skill has to live somewhere.
  test(`${name} renders the Skills row even with no skills`, () => {
    const block = render({ ...emptyMonster(), skills: {} });
    const chips = block.querySelector('.sb-chips[data-field="skills"]');

    assert.ok(chips, "skills chip container is present");
    assert.equal(chips!.querySelectorAll(".sb-chip").length, 0);
    assert.ok(chips!.querySelector(".sb-chip-add"), "add affordance is present");
    assert.equal(chips!.closest(".line")?.dataset.dep, "all");
  });

  test(`${name} renders a chip per skill`, () => {
    const block = render({ ...emptyMonster(), skills: { Perception: 7, Stealth: -1 } });
    const chips = [...block.querySelectorAll(".sb-chip")].map((c) => c.textContent);

    assert.deepEqual(chips, ["Perception +7×", "Stealth −1×"]);
  });
}
