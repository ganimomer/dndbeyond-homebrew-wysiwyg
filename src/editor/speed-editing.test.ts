import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster, Movement } from "../statblock/model.js";

// speed-line + context-menu build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { speedChips } = await import("../preview/speed-line.js");
const { wireMovements } = await import("./speed-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

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
const scopeFor = (monster: Monster) => {
  const root = jsdom.window.document.createElement("div");
  root.append(speedChips(monster));
  return root;
};
const labels = (scope: ParentNode) =>
  [...scope.querySelectorAll(".cp-option")].map((n) => n.textContent);
const speedInput = (scope: ParentNode, type: string) =>
  scope.querySelector<HTMLInputElement>(`.speed-input[data-movement="${type}"]`)!;

test("renders a chip per movement, with walk unlabelled and notes shown", () => {
  const scope = scopeFor(
    monsterWith([
      { type: "Walk", speed: 40 },
      { type: "Fly", speed: 60, note: "hover" },
    ]),
  );

  const chips = [...scope.querySelectorAll<HTMLElement>(".sb-chip")];
  assert.deepEqual(chips.map((c) => c.dataset.value), ["Walk", "Fly"]);

  // Walking prints bare, the way a stat block does; everything else is labelled.
  assert.equal(chips[0]!.querySelector(".sb-chip-label"), null);
  assert.equal(chips[1]!.querySelector(".sb-chip-label")?.textContent, "Fly");
  // …but the ✕ still names it, since there's no visible label to go on.
  assert.equal(
    chips[0]!.querySelector(".sb-chip-remove")?.getAttribute("aria-label"),
    "Remove Walk",
  );

  // The distances are editable; the unit and the note are plain text.
  assert.equal(speedInput(scope, "Walk").value, "40");
  assert.equal(speedInput(scope, "Fly").value, "60");
  assert.match(chips[1]!.textContent ?? "", /ft\. \(hover\)/);
});

test("the menu offers the missing types at the speed they would arrive with", () => {
  const monster = monsterWith([{ type: "Walk", speed: 40 }]);
  const scope = scopeFor(monster);
  wireMovements(scope, monster, stubAdapter(["Walk"]).adapter);

  // Everything matches the walk speed, so adding a climb speed needs no typing.
  assert.deepEqual(labels(scope), [
    "Burrow 40 ft.",
    "Climb 40 ft.",
    "Fly 40 ft.",
    "Swim 40 ft.",
  ]);
});

test("with no walk speed the menu falls back to 30 ft., and Walk itself offers 30", () => {
  const monster = monsterWith([]);
  const scope = scopeFor(monster);
  wireMovements(scope, monster, stubAdapter([]).adapter);

  assert.deepEqual(labels(scope), [
    "30 ft.", // Walk, printed bare
    "Burrow 30 ft.",
    "Climb 30 ft.",
    "Fly 30 ft.",
    "Swim 30 ft.",
  ]);
});

test("picking a type adds it with that default", () => {
  const monster = monsterWith([{ type: "Walk", speed: 40 }]);
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Walk"]);
  const added: string[] = [];
  wireMovements(scope, monster, adapter, { onAdd: (t) => added.push(t) });

  const fly = [...scope.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Fly"),
  )!;
  fly.dispatchEvent(new jsdom.window.Event("click"));

  assert.deepEqual(calls.added, [[ID.Fly!, 40]]);
  // The panel is told which input to focus before the row is rebuilt.
  assert.deepEqual(added, ["Fly"]);
});

test("committing a changed distance writes it back", () => {
  const monster = monsterWith([{ type: "Climb", speed: 40 }]);
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Climb"]);
  wireMovements(scope, monster, adapter);

  const input = speedInput(scope, "Climb");
  input.value = "60";
  input.dispatchEvent(new jsdom.window.Event("change"));

  assert.deepEqual(calls.set, [["Climb", 60]]);
});

test("an unchanged or unusable distance commits nothing", () => {
  const monster = monsterWith([{ type: "Climb", speed: 40 }]);
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Climb"]);
  wireMovements(scope, monster, adapter);
  const input = speedInput(scope, "Climb");

  input.value = "40";
  input.dispatchEvent(new jsdom.window.Event("change"));
  input.value = "";
  input.dispatchEvent(new jsdom.window.Event("change"));

  assert.deepEqual(calls.set, []);
  assert.equal(input.value, "40", "junk is replaced by what's stored");
});

test("Enter commits the distance", () => {
  const monster = monsterWith([{ type: "Climb", speed: 40 }]);
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Climb"]);
  wireMovements(scope, monster, adapter);

  // Without a <form> to submit, Enter alone never produces a `change` — the
  // handler blurs to force one, or the typed value would be silently dropped.
  const input = speedInput(scope, "Climb");
  let committed = false;
  // Stand in for the browser: blurring a dirty field is what emits `change`.
  input.blur = () => {
    committed = true;
    input.dispatchEvent(new jsdom.window.Event("change"));
  };
  input.value = "60";
  input.dispatchEvent(
    new jsdom.window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
  );

  assert.ok(committed, "Enter blurred the field");
  assert.deepEqual(calls.set, [["Climb", 60]]);
});

test("a chip's ✕ removes that movement", () => {
  const monster = monsterWith([{ type: "Walk", speed: 40 }, { type: "Climb", speed: 40 }]);
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Walk", "Climb"]);
  wireMovements(scope, monster, adapter);

  const climb = [...scope.querySelectorAll<HTMLElement>(".sb-chip")].find(
    (c) => c.dataset.value === "Climb",
  )!;
  climb.querySelector<HTMLButtonElement>(".sb-chip-remove")!.dispatchEvent(
    new jsdom.window.Event("click"),
  );

  assert.deepEqual(calls.removed, ["Climb"]);
});

test("the add affordance disappears once every type is present", () => {
  const types = ["Walk", "Burrow", "Climb", "Fly", "Swim"];
  const monster = monsterWith(types.map((type) => ({ type, speed: 30 })));
  const scope = scopeFor(monster);
  wireMovements(scope, monster, stubAdapter(types).adapter);

  assert.equal(scope.querySelector(".sb-chip-menu"), null);
});

test("each distance carries the focus key the panel restores to", () => {
  const scope = scopeFor(monsterWith([{ type: "Fly", speed: 60 }]));
  assert.equal(speedInput(scope, "Fly").dataset.focusKey, "speed:Fly");
});
