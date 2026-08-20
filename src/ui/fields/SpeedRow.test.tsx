import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster, type Movement } from "../../statblock/model.js";
import { fireEvent, renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { SpeedRow } from "./SpeedRow.js";

/** DDB's real movement ids. */
const ID: Record<string, string> = { Walk: "1", Burrow: "2", Climb: "3", Fly: "4", Swim: "5" };

function stubAdapter(present: string[]) {
  const calls = {
    added: [] as Array<[string, number]>,
    set: [] as Array<[string, number]>,
    removed: [] as string[],
  };
  const adapter = {
    movementOptions: (): SelectOption[] =>
      Object.entries(ID).map(([text, value]) => ({ value, text, selected: present.includes(text) })),
    addMovement: (value: string, speed: number) => {
      calls.added.push([value, speed]);
      return Promise.resolve();
    },
    setMovementSpeed: (type: string, speed: number) => {
      calls.set.push([type, speed]);
      return Promise.resolve();
    },
    removeMovement: (type: string) => {
      calls.removed.push(type);
      return Promise.resolve();
    },
  };
  return { adapter, calls };
}

const monsterWith = (movements: Movement[]): Monster => ({ ...emptyMonster(), movements });

function setup(t: import("node:test").TestContext, movements: Movement[]) {
  const { adapter, calls } = stubAdapter(movements.map((m) => m.type));
  const view = renderInShadowRoot(t, <SpeedRow monster={monsterWith(movements)} adapter={adapter} />);
  const labels = () => [...view.root.querySelectorAll(".cp-option")].map((n) => n.textContent ?? "");
  const speedInput = (type: string) =>
    view.root.querySelector<HTMLInputElement>(`.speed-input[data-movement="${type}"]`)!;
  return { ...view, calls, labels, speedInput, adapter };
}

test("renders a chip per movement, with walk unlabelled and notes shown", (t) => {
  const { root, speedInput } = setup(t, [
    { type: "Walk", speed: 40 },
    { type: "Fly", speed: 60, note: "hover" },
  ]);

  const chips = [...root.querySelectorAll<HTMLElement>(".sb-chip")];
  assert.deepEqual(
    chips.map((c) => c.dataset.value),
    ["Walk", "Fly"],
  );

  // Walking prints bare, the way a stat block does; everything else is labelled.
  assert.equal(chips[0]!.querySelector(".sb-chip-label"), null);
  assert.equal(chips[1]!.querySelector(".sb-chip-label")?.textContent, "Fly");
  // …but the ✕ still names it, since there's no visible label to go on.
  assert.equal(
    chips[0]!.querySelector(".sb-chip-remove")?.getAttribute("aria-label"),
    "Remove Walk",
  );

  // The distances are editable; the unit and the note are plain text.
  assert.equal(speedInput("Walk").value, "40");
  assert.equal(speedInput("Fly").value, "60");
  assert.match(chips[1]!.textContent ?? "", /ft\. \(hover\)/);
});

test("the menu offers the missing types at the speed they would arrive with", (t) => {
  const { labels } = setup(t, [{ type: "Walk", speed: 40 }]);

  // Everything matches the walk speed, so adding a climb speed needs no typing.
  assert.deepEqual(labels(), ["Burrow 40 ft.", "Climb 40 ft.", "Fly 40 ft.", "Swim 40 ft."]);
});

test("with no walk speed the menu falls back to 30 ft., and Walk itself offers 30", (t) => {
  const { labels } = setup(t, []);

  assert.deepEqual(labels(), [
    "30 ft.", // Walk, printed bare
    "Burrow 30 ft.",
    "Climb 30 ft.",
    "Fly 30 ft.",
    "Swim 30 ft.",
  ]);
});

test("picking a type adds it with that default", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, [{ type: "Walk", speed: 40 }]);

  await user.click(root.querySelector<HTMLElement>(".cp-trigger.add")!);
  const fly = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Fly"),
  )!;
  await user.click(fly);

  assert.deepEqual(calls.added, [[ID.Fly!, 40]]);
});

test("a movement that arrives holds the caret, with its default selected", (t) => {
  const { root, rerender, adapter } = setup(t, [{ type: "Walk", speed: 40 }]);

  root.querySelector<HTMLElement>(".cp-trigger.add")!.click();
  const fly = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Fly"),
  )!;
  fly.click();
  // What the add's round-trip brings back.
  rerender(
    <SpeedRow
      monster={monsterWith([
        { type: "Walk", speed: 40 },
        { type: "Fly", speed: 40 },
      ])}
      adapter={adapter}
    />,
  );

  const input = root.querySelector<HTMLInputElement>('.speed-input[data-movement="Fly"]')!;
  assert.equal(root.activeElement, input, "the new distance holds the caret");
});

test("committing a changed distance writes it back", (t) => {
  const { calls, speedInput } = setup(t, [{ type: "Climb", speed: 40 }]);

  const input = speedInput("Climb");
  input.value = "60";
  fireEvent.change(input);

  assert.deepEqual(calls.set, [["Climb", 60]]);
});

test("an unchanged or unusable distance commits nothing", (t) => {
  const { calls, speedInput } = setup(t, [{ type: "Climb", speed: 40 }]);
  const input = speedInput("Climb");

  input.value = "40";
  fireEvent.change(input);
  input.value = "";
  fireEvent.change(input);

  assert.deepEqual(calls.set, []);
  assert.equal(input.value, "40", "junk is replaced by what's stored");
});

test("Enter commits the distance", (t) => {
  const { calls, speedInput } = setup(t, [{ type: "Climb", speed: 40 }]);

  // Without a <form> to submit, Enter alone never produces a `change` — the
  // handler blurs to force one, or the typed value would be silently dropped.
  const input = speedInput("Climb");
  let blurred = false;
  input.blur = () => {
    blurred = true;
    fireEvent.change(input);
  };
  input.value = "60";
  fireEvent.keyDown(input, { key: "Enter" });

  assert.ok(blurred, "Enter blurred the field");
  assert.deepEqual(calls.set, [["Climb", 60]]);
});

test("a chip's ✕ removes that movement", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, [
    { type: "Walk", speed: 40 },
    { type: "Climb", speed: 40 },
  ]);

  const climb = [...root.querySelectorAll<HTMLElement>(".sb-chip")].find(
    (c) => c.dataset.value === "Climb",
  )!;
  await user.click(climb.querySelector<HTMLElement>(".sb-chip-remove")!);

  assert.deepEqual(calls.removed, ["Climb"]);
});

test("the add affordance disappears once every type is present", (t) => {
  const types = ["Walk", "Burrow", "Climb", "Fly", "Swim"];
  const { root } = setup(
    t,
    types.map((type) => ({ type, speed: 30 })),
  );

  assert.equal(root.querySelector(".sb-chip-menu"), null);
});
