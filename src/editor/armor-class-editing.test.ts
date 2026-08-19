import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { ArmorClass, Monster } from "../statblock/model.js";

// armor-class-line builds DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { armorClassChip } = await import("../preview/armor-class-line.js");
const { wireArmorClass } = await import("./armor-class-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

/** AC 16 on a DEX 18 (+4) creature: unarmored 14, so the armor is worth 2. */
const PLATED: ArmorClass = { value: 16, type: "natural armor" };

function monsterWith(armorClass: ArmorClass, dex = 18): Monster {
  const monster = emptyMonster();
  return { ...monster, armorClass, abilities: { ...monster.abilities, dex } };
}

interface WireOptions {
  open?: boolean;
  dexChanged?: boolean;
  /** What the armor was worth before this session's DEX edits. */
  armorBonus?: number;
}

function setup(
  monster: Monster,
  { open = true, dexChanged = false, armorBonus }: WireOptions = {},
) {
  const scope = jsdom.window.document.createElement("div");
  scope.append(armorClassChip(monster));

  const calls = {
    opened: 0,
    changed: [] as ArmorClass[],
    committed: [] as ArmorClass[],
    cancelled: 0,
  };
  wireArmorClass(scope, monster, {
    state: open ? { draft: { ...monster.armorClass } } : null,
    dexChanged,
    armorBonus: armorBonus ?? null,
    onOpen: () => calls.opened++,
    onChange: (ac) => calls.changed.push(ac),
    onCommit: (ac) => calls.committed.push(ac),
    onCancel: () => calls.cancelled++,
  });
  return { scope, calls };
}

const field = (scope: ParentNode, name: string) =>
  scope.querySelector<HTMLInputElement>(`[data-ac="${name}"]`)!;
const prefix = (scope: ParentNode) =>
  scope.querySelector<HTMLElement>(".ac-prefix")!.textContent;
const hint = (scope: ParentNode) => scope.querySelector<HTMLElement>('[data-hint="armor class"]');
const action = (scope: ParentNode, name: string) =>
  scope.querySelector<HTMLButtonElement>(`[data-form-action="${name}"]`)!;
const click = (node: Element) => node.dispatchEvent(new jsdom.window.Event("click"));
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new jsdom.window.Event("input", { bubbles: true }));
};
const press = (input: HTMLInputElement, key: string) =>
  input.dispatchEvent(
    new jsdom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

test("closed, the whole value is one button that opens the form", () => {
  const { scope, calls } = setup(monsterWith(PLATED), { open: false });

  const chip = scope.querySelector<HTMLButtonElement>(".sb-chip-button")!;
  assert.match(chip.textContent ?? "", /16 \(natural armor\)/);

  click(chip);
  assert.equal(calls.opened, 1);
});

test("open, the class is split into what Dexterity gives and what armor adds", () => {
  const { scope } = setup(monsterWith(PLATED));

  assert.equal(scope.querySelector(".sb-chip-button"), null, "the chip is gone");
  assert.equal(prefix(scope), "14 +", "10 + the DEX 18 modifier");
  assert.equal(field(scope, "bonus").value, "2");
  assert.equal(field(scope, "value").value, "16");
  assert.equal(field(scope, "type").value, "natural armor");
});

test("editing the bonus rewrites the total", () => {
  const { scope } = setup(monsterWith(PLATED));

  type(field(scope, "bonus"), "5");

  assert.equal(field(scope, "value").value, "19");
});

test("editing the total rewrites the bonus", () => {
  const { scope } = setup(monsterWith(PLATED));

  type(field(scope, "value"), "20");

  assert.equal(field(scope, "bonus").value, "6");
});

test("typing a minus flips the prefix and leaves the field a magnitude", () => {
  const { scope } = setup(monsterWith(PLATED));

  type(field(scope, "bonus"), "-3");

  assert.equal(prefix(scope), "14 −");
  assert.equal(field(scope, "bonus").value, "3", "the sign lives in the prefix");
  assert.equal(field(scope, "value").value, "11");
});

test("a total below the unarmored class flips the prefix too", () => {
  const { scope } = setup(monsterWith(PLATED));

  type(field(scope, "value"), "11");

  assert.equal(prefix(scope), "14 −");
  assert.equal(field(scope, "bonus").value, "3");
});

test("stepping the bonus below zero flips the prefix rather than sticking", () => {
  const { scope } = setup(monsterWith({ value: 14, type: "" }));
  assert.equal(field(scope, "bonus").value, "0", "unarmored to begin with");

  // What a number input's down-arrow (or spinner) produces at zero.
  press(field(scope, "bonus"), "ArrowDown");

  assert.equal(prefix(scope), "14 −");
  assert.equal(field(scope, "bonus").value, "1");
  assert.equal(field(scope, "value").value, "13");
});

test("the arrows walk the signed scale, so they don't invert below zero", () => {
  const { scope } = setup(monsterWith({ value: 13, type: "" })); // bonus −1
  assert.equal(prefix(scope), "14 −");

  press(field(scope, "bonus"), "ArrowUp");

  assert.equal(prefix(scope), "14 +", "−1 steps up to 0, not down to −2");
  assert.equal(field(scope, "bonus").value, "0");
  assert.equal(field(scope, "value").value, "14");
});

test("an untouched Dexterity offers nothing, even on a hand-set class", () => {
  const { scope } = setup(monsterWith(PLATED), { armorBonus: 4 });

  assert.equal(hint(scope), null);
});

test("a Dexterity change offers the class that keeps the armor worth what it was", () => {
  // DEX was 14 (unarmored 12) with AC 16, so the armor is worth 4. DEX is now
  // 18 (unarmored 14), which would silently reinterpret the armor as worth 2.
  const { scope } = setup(monsterWith(PLATED), { dexChanged: true, armorBonus: 4 });

  const offered = hint(scope);
  assert.equal(offered?.textContent, "←18");

  click(offered!);

  assert.equal(field(scope, "value").value, "18");
  assert.equal(field(scope, "bonus").value, "4", "the armor is worth 4 again");
  assert.equal(hint(scope), null, "taken, so no longer offered");
});

test("✓ commits the number and the type together", () => {
  const { scope, calls } = setup(monsterWith(PLATED));

  type(field(scope, "bonus"), "5");
  type(field(scope, "type"), "plate armor");
  click(action(scope, "commit"));

  assert.deepEqual(calls.committed, [{ value: 19, type: "plate armor" }]);
});

test("Enter in a field commits the whole form", () => {
  const { scope, calls } = setup(monsterWith(PLATED));

  type(field(scope, "value"), "17");
  press(field(scope, "value"), "Enter");

  assert.deepEqual(calls.committed, [{ value: 17, type: "natural armor" }]);
});

test("✕ and Escape abandon the edit", () => {
  for (const abandon of [
    (scope: ParentNode) => click(action(scope, "cancel")),
    (scope: ParentNode) => press(field(scope, "value"), "Escape"),
  ]) {
    const { scope, calls } = setup(monsterWith(PLATED));
    type(field(scope, "value"), "99");
    abandon(scope);

    assert.equal(calls.cancelled, 1);
    assert.deepEqual(calls.committed, []);
  }
});

test("the type field names itself while empty", () => {
  const { scope } = setup(monsterWith({ value: 16, type: "" }));

  assert.equal(field(scope, "type").placeholder, "armor type");
});

test("every edit is reported so the panel can hold the draft across re-renders", () => {
  const { scope, calls } = setup(monsterWith(PLATED));

  type(field(scope, "value"), "18");

  assert.deepEqual(calls.changed.at(-1), { value: 18, type: "natural armor" });
});

test("each field carries the focus key the panel restores to", () => {
  const { scope } = setup(monsterWith(PLATED));

  assert.equal(field(scope, "bonus").dataset.focusKey, "ac:bonus");
  assert.equal(field(scope, "value").dataset.focusKey, "ac:value");
  assert.equal(field(scope, "type").dataset.focusKey, "ac:type");
});
