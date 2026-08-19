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

const PLATED = { value: 16, type: "natural armor" };

for (const [name, render] of [
  ["5e", render5e],
  ["5.5e", render55e],
] as const) {
  test(`${name} makes the armor class one clickable chip`, () => {
    const block = render({ ...emptyMonster(), armorClass: PLATED });
    const chips = block.querySelector('.sb-chips[data-field="armorClass"]');

    assert.ok(chips, "armor-class chip container is present");
    const button = chips!.querySelector<HTMLButtonElement>(".sb-chip-button");
    assert.ok(button, "the value itself is the button");
    assert.match(button!.textContent ?? "", /^16 \(natural armor\)$/);
  });

  test(`${name} keeps the armor class flagged as depending on Dexterity`, () => {
    // The highlight that warns a DEX edit may have invalidated it — the only
    // signal while the chip is closed. In 5.5e it sits on the value span rather
    // than the line, which also carries Initiative.
    const block = render({ ...emptyMonster(), armorClass: PLATED });
    const chips = block.querySelector('.sb-chips[data-field="armorClass"]')!;

    assert.ok(chips.closest('[data-dep~="dex"]'), "inside a dex-dependent element");
  });
}
