import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render55e } = await import("../preview/render-55e.js");
const { wireSenses } = await import("./senses-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

const SENSES = (taken: string[]): SelectOption[] =>
  [
    ["1", "Blindsight"],
    ["2", "Darkvision"],
    ["3", "Tremorsense"],
    ["4", "Truesight"],
  ].map(([value, text]) => ({ value: value!, text: text!, selected: taken.includes(text!) }));

function stubAdapter(taken: string[] = []) {
  const calls = {
    added: [] as Array<[string, string]>,
    notes: [] as Array<[string, string]>,
    removed: [] as string[],
    passive: [] as number[],
  };
  return {
    calls,
    adapter: {
      senseOptions: () => SENSES(taken),
      addSense: async (value: string, note: string) => void calls.added.push([value, note]),
      setSenseNote: async (type: string, note: string) => void calls.notes.push([type, note]),
      removeSense: async (type: string) => void calls.removed.push(type),
      setPassivePerception: (value: number) => calls.passive.push(value),
    },
  };
}

const click = (el: Element) => el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));
const change = (el: Element) => el.dispatchEvent(new jsdom.window.Event("change"));

const withSense: Monster = {
  ...emptyMonster(),
  senses: [{ type: "Darkvision", note: "120 ft." }],
  passivePerception: 17,
};

test("the menu offers the senses the creature hasn't got, with their usual range", () => {
  const block = render55e(withSense);
  const { adapter } = stubAdapter(["Darkvision"]);
  wireSenses(block, withSense, adapter);

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="senses"]')!;
  assert.deepEqual(
    [...row.querySelectorAll(".cm-item .cm-label")].map((n) => n.textContent),
    ["Blindsight 30 ft.", "Tremorsense 60 ft.", "Truesight 120 ft."],
  );
});

test("adding a sense sends its id and default range, and queues focus for it", () => {
  const block = render55e(withSense);
  const { adapter, calls } = stubAdapter(["Darkvision"]);
  const focused: string[] = [];
  wireSenses(block, withSense, adapter, { onAdd: (type) => focused.push(type) });

  const item = [...block.querySelectorAll<HTMLElement>(".cm-item")].find((li) =>
    li.textContent?.startsWith("Truesight"),
  )!;
  click(item);

  assert.deepEqual(calls.added, [["4", "120 ft."]]);
  assert.deepEqual(focused, ["Truesight"]);
});

test("a range commits on change, and only when it actually changed", () => {
  const block = render55e(withSense);
  const { adapter, calls } = stubAdapter(["Darkvision"]);
  wireSenses(block, withSense, adapter);

  const input = block.querySelector<HTMLInputElement>('.sense-input[data-sense="Darkvision"]')!;
  change(input); // untouched
  assert.deepEqual(calls.notes, []);

  input.value = "60 ft.";
  change(input);
  assert.deepEqual(calls.notes, [["Darkvision", "60 ft."]]);
});

test("removing the last sense chip commits the removal", () => {
  const block = render55e(withSense);
  const { adapter, calls } = stubAdapter(["Darkvision"]);
  wireSenses(block, withSense, adapter);

  click(block.querySelector('.sb-chips[data-field="senses"] .sb-chip-remove')!);

  assert.deepEqual(calls.removed, ["Darkvision"]);
});

test("passive Perception commits as a number and rejects junk", () => {
  const block = render55e(withSense);
  const { adapter, calls } = stubAdapter(["Darkvision"]);
  let saves = 0;
  wireSenses(block, withSense, adapter, { onPassivePerception: () => (saves += 1) });

  const input = block.querySelector<HTMLInputElement>(".passive-input")!;
  input.value = "19";
  change(input);
  assert.deepEqual(calls.passive, [19]);
  assert.equal(saves, 1);

  input.value = "";
  change(input);
  assert.deepEqual(calls.passive, [19], "nothing committed");
  assert.equal(input.value, "17", "shows what's stored");
});

test("the row is rendered for a creature with only a passive Perception", () => {
  const monster: Monster = { ...emptyMonster(), passivePerception: 10 };
  const block = render55e(monster);

  assert.ok(block.querySelector('.sb-chips[data-field="senses"]'), "the Senses row is present");
  assert.equal(block.querySelectorAll('.sb-chips[data-field="senses"] .sb-chip').length, 0);
});
