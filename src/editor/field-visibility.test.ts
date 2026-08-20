import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { Monster } from "../statblock/model.js";
import type { OptionalField } from "../preview/optional-fields.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render55e } = await import("../preview/render-55e.js");
const { basicsFields, hiddenFields } = await import("../preview/optional-fields.js");
const { wireAddField } = await import("./field-visibility.js");
const { emptyMonster } = await import("../statblock/model.js");

const click = (el: Element) => el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));

function mount(monster: Monster, revealed?: Set<OptionalField>) {
  const block = render55e(monster, { revealed });
  const revealedKeys: OptionalField[] = [];
  const focusKeys: string[] = [];
  const menus = wireAddField(
    block,
    hiddenFields(monster, revealed, monster.ruleset),
    (spec) => {
      revealedKeys.push(spec.key);
      focusKeys.push(spec.focusKey);
    },
  );
  return { block, revealedKeys, focusKeys, menus };
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

test("picking one reveals that field, and names the control to land in", () => {
  const { block, revealedKeys, focusKeys } = mount(emptyMonster());

  const item = [...block.querySelectorAll<HTMLElement>(".add-field .cm-item")].find(
    (li) => li.textContent === "Senses",
  )!;
  click(item);

  assert.deepEqual(revealedKeys, ["senses"]);
  assert.deepEqual(focusKeys, ["add:senses"]);
});

test("a revealed field leaves the menu, and the footer goes once it's empty", () => {
  const revealed = new Set<OptionalField>(["senses"]);
  const { block } = mount(emptyMonster(), revealed);

  const offered = [...block.querySelectorAll(".add-field .cm-item .cm-label")].map((n) => n.textContent);
  assert.ok(!offered.includes("Senses"), "already on the block");
  assert.ok(block.querySelector('[data-island="senses"]'), "and rendered");
});

test("every optional field names a control to land in, and the block has it", () => {
  // Adding a row is always a prelude to filling it in, so each spec points at
  // either an input's data-focus-key or the picker the panel should open.
  const monster = emptyMonster();
  const revealed = new Set(basicsFields(monster.ruleset).map((spec) => spec.key));
  const block = render55e(monster, { revealed });

  for (const spec of basicsFields(monster.ruleset)) {
    assert.ok(spec.focusKey, `${spec.key} has no focusKey`);
    if (spec.focusKey.startsWith("add:")) {
      // A picker's trigger is stamped by the editor, not the renderer; what the
      // renderer owes is the host it mounts into — a chip row's menu slot, or
      // the hole a field that has become a component goes in.
      assert.ok(
        block.querySelector(`.sb-chips[data-field="${spec.key}"] .sb-chip-menu`) ??
          block.querySelector(`[data-island="${spec.key}"]`),
        `${spec.key} renders no picker host`,
      );
    } else {
      assert.ok(
        block.querySelector(`[data-focus-key="${spec.focusKey}"]`) ??
          block.querySelector(`.meta-slot[data-meta="${spec.key}"]`) ??
          // A field that has become a component: the renderer owes the hole,
          // and the component carries the focus key into it. The four meta
          // slots share one hole, since the line is assembled as a sentence.
          block.querySelector(`[data-island="${spec.key}"]`) ??
          (spec.slot === "meta" ? block.querySelector('[data-island="meta"]') : null),
        `${spec.focusKey} is on nothing the renderer emits`,
      );
    }
  }
});

