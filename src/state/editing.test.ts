/**
 * What these are really testing is that an edit captured enough to be undone.
 *
 * The trap is that the model speaks in labels ("Perception", "Medium") while
 * D&D Beyond's controls speak in numeric codes, and a bonus or a range lives on
 * the record about to be deleted. Whatever `revert` will need has to be read
 * *before* the edit, or it is gone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageAdapter, SelectOption } from "../adapter/types.js";
import { emptyMonster, type Monster } from "../statblock/model.js";
import { CommandStack } from "./command.js";
import { EditingAdapter } from "./editing.js";

const options = (entries: Array<[string, string, boolean?]>): SelectOption[] =>
  entries.map(([value, text, selected = false]) => ({ value, text, selected }));

function harness(monster: Monster) {
  const calls: Array<[string, ...unknown[]]> = [];
  /** A form-field setter: synchronous, exactly as PageAdapter declares them. */
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push([name, ...args]);
    };
  /** A listing-record setter: a request, so it answers with a promise. */
  const request =
    (name: string) =>
    (...args: unknown[]): Promise<void> => {
      calls.push([name, ...args]);
      return Promise.resolve();
    };

  const adapter = {
    skillOptions: () => options([["14", "Perception", true], ["5", "Stealth"]]),
    senseOptions: () => options([["2", "Darkvision", true], ["1", "Blindsight"]]),
    movementOptions: () => options([["1", "Walk", true], ["4", "Fly"]]),
    sizeOptions: () => options([["3", "Medium", true], ["4", "Large"]]),
    addSkill: request("addSkill"),
    removeSkill: request("removeSkill"),
    addSense: request("addSense"),
    removeSense: request("removeSense"),
    setSenseNote: request("setSenseNote"),
    setMovementSpeed: request("setMovementSpeed"),
    setSize: record("setSize"),
    setName: record("setName"),
  } as unknown as PageAdapter;

  const stack = new CommandStack(adapter, () => {});
  return { editing: new EditingAdapter(adapter, stack, () => monster), stack, calls };
}

test("removing a skill remembers what it would take to put it back", async () => {
  const { editing, stack, calls } = harness({
    ...emptyMonster(),
    skills: { Perception: 7 },
  });

  await editing.removeSkill("Perception");
  assert.deepEqual(calls, [["removeSkill", "Perception"]]);

  await stack.undo();

  // Back by D&D Beyond's own code for the skill, carrying the bonus it had.
  assert.deepEqual(calls[1], ["addSkill", "14", 7]);
});

test("removing a sense remembers its range", async () => {
  const { editing, stack, calls } = harness({
    ...emptyMonster(),
    senses: [{ type: "Darkvision", note: "120 ft." }],
  });

  await editing.removeSense("Darkvision");
  await stack.undo();

  assert.deepEqual(calls[1], ["addSense", "2", "120 ft."]);
});

test("changing a speed goes back to the one it had", async () => {
  const { editing, stack, calls } = harness({
    ...emptyMonster(),
    movements: [{ type: "Walk", speed: 30 }],
  });

  await editing.setMovementSpeed("Walk", 40);
  await stack.undo();

  assert.deepEqual(calls, [
    ["setMovementSpeed", "Walk", 40],
    ["setMovementSpeed", "Walk", 30],
  ]);
});

test("a dropdown goes back to the option it had chosen, not its label", async () => {
  const { editing, stack, calls } = harness({ ...emptyMonster(), size: "Medium" });

  editing.setSize("4");
  await stack.undo();

  assert.deepEqual(calls, [
    ["setSize", "4"],
    ["setSize", "3"],
  ]);
});

test("a plain field goes back to the value the creature had", async () => {
  const { editing, stack, calls } = harness({ ...emptyMonster(), name: "Vampire" });

  editing.setName("Dread Vampire");
  await stack.undo();

  assert.deepEqual(calls, [
    ["setName", "Dread Vampire"],
    ["setName", "Vampire"],
  ]);
});
