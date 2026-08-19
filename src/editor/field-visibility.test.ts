import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { Monster } from "../statblock/model.js";
import type { OptionalField } from "../preview/optional-fields.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render55e } = await import("../preview/render-55e.js");
const { hiddenFields } = await import("../preview/optional-fields.js");
const { revealFocusKey, wireAddField } = await import("./field-visibility.js");
const { emptyMonster } = await import("../statblock/model.js");

const click = (el: Element) => el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));

function mount(monster: Monster, revealed?: Set<OptionalField>) {
  const block = render55e(monster, { revealed });
  const revealedKeys: OptionalField[] = [];
  const menus = wireAddField(
    block,
    hiddenFields(monster, revealed, monster.ruleset),
    (key) => revealedKeys.push(key),
  );
  return { block, revealedKeys, menus };
}

test("the menu names every field the creature hasn't got, meta slots first", () => {
  const { block } = mount(emptyMonster());

  assert.deepEqual(
    [...block.querySelectorAll(".add-field .cm-item .cm-label")].map((n) => n.textContent),
    [
      "Subtype",
      "Skills",
      "Vulnerabilities",
      "Resistances",
      "Immunities",
      "Gear",
      "Senses",
      "Languages",
    ],
  );
});

test("picking one reveals that field", () => {
  const { block, revealedKeys } = mount(emptyMonster());

  const item = [...block.querySelectorAll<HTMLElement>(".add-field .cm-item")].find(
    (li) => li.textContent === "Senses",
  )!;
  click(item);

  assert.deepEqual(revealedKeys, ["senses"]);
});

test("a revealed field leaves the menu, and the footer goes once it's empty", () => {
  const revealed = new Set<OptionalField>(["senses"]);
  const { block } = mount(emptyMonster(), revealed);

  const offered = [...block.querySelectorAll(".add-field .cm-item .cm-label")].map((n) => n.textContent);
  assert.ok(!offered.includes("Senses"), "already on the block");
  assert.ok(block.querySelector('.sb-chips[data-field="senses"]'), "and rendered");
});

test("a field the user must type into gets the caret; a menu-driven one doesn't", () => {
  assert.equal(revealFocusKey("gear"), "text:gear");
  assert.equal(revealFocusKey("languages"), "text:languages");
  assert.equal(revealFocusKey("skills"), null);
});
