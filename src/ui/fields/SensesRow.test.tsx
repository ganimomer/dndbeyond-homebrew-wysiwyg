import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { fireEvent, renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { SensesRow } from "./SensesRow.js";

const SENSES = (taken: string[]): SelectOption[] =>
  (
    [
      ["1", "Blindsight"],
      ["2", "Darkvision"],
      ["3", "Tremorsense"],
      ["4", "Truesight"],
    ] as const
  ).map(([value, text]) => ({ value, text, selected: taken.includes(text) }));

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

const withSense: Monster = {
  ...emptyMonster(),
  senses: [{ type: "Darkvision", note: "120 ft." }],
  passivePerception: 17,
};

function setup(t: import("node:test").TestContext, monster = withSense, taken = ["Darkvision"]) {
  const { adapter, calls } = stubAdapter(taken);
  const view = renderInShadowRoot(t, <SensesRow monster={monster} adapter={adapter} />);
  return { ...view, calls, adapter };
}

test("the menu offers the senses the creature hasn't got, with their usual range", (t) => {
  const { root } = setup(t);

  assert.deepEqual(
    [...root.querySelectorAll(".cp-option")].map((n) => n.textContent),
    ["Blindsight 30 ft.", "Tremorsense 60 ft.", "Truesight 120 ft."],
  );
});

test("adding a sense sends its id and default range", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t);

  await user.click(root.querySelector<HTMLElement>(".cp-trigger.add")!);
  const truesight = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Truesight"),
  )!;
  await user.click(truesight);

  assert.deepEqual(calls.added, [["4", "120 ft."]]);
});

test("a sense that arrives gets the caret, ready to type the range over", (t) => {
  const { root, rerender, adapter } = setup(t);

  // What the add's round-trip brings back: the creature now has the sense.
  const withTruesight: Monster = {
    ...withSense,
    senses: [...withSense.senses, { type: "Truesight", note: "120 ft." }],
  };
  // Simulate the pick, then the re-render its write-back causes.
  root.querySelector<HTMLElement>(".cp-trigger.add")!.click();
  const truesight = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Truesight"),
  )!;
  truesight.click();
  rerender(<SensesRow monster={withTruesight} adapter={adapter} />);

  const input = root.querySelector<HTMLInputElement>('.sense-input[data-sense="Truesight"]')!;
  assert.equal(root.activeElement, input, "the new range holds the caret");
});

test("a range commits on change, and only when it actually changed", (t) => {
  const { root, calls } = setup(t);
  const input = root.querySelector<HTMLInputElement>('.sense-input[data-sense="Darkvision"]')!;

  fireEvent.change(input); // untouched
  assert.deepEqual(calls.notes, []);

  input.value = "60 ft.";
  fireEvent.change(input);
  assert.deepEqual(calls.notes, [["Darkvision", "60 ft."]]);
});

test("removing the last sense chip commits the removal", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t);

  await user.click(root.querySelector<HTMLElement>(".sb-chip-remove")!);

  assert.deepEqual(calls.removed, ["Darkvision"]);
});

test("passive Perception commits as a number and rejects junk", (t) => {
  const { root, calls } = setup(t);
  const input = root.querySelector<HTMLInputElement>(".passive-input")!;

  input.value = "19";
  fireEvent.change(input);
  assert.deepEqual(calls.passive, [19]);

  input.value = "";
  fireEvent.change(input);
  assert.deepEqual(calls.passive, [19], "nothing committed");
  assert.equal(input.value, "17", "shows what's stored");
});

test("the row renders for a creature with only a passive Perception", (t) => {
  const { root } = setup(t, { ...emptyMonster(), passivePerception: 10 }, []);

  assert.ok(root.querySelector(".sb-passive"), "the passive Perception is there");
  assert.equal(root.querySelectorAll(".sb-chip").length, 0);
});
