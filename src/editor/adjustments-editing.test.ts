import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render5e } = await import("../preview/render-5e.js");
const { render55e } = await import("../preview/render-55e.js");
const { wireAdjustments } = await import("./adjustments-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

// DDB packs all three damage adjustments into one select, labelled "X - Kind".
const DAMAGE = (selected: string[]): SelectOption[] =>
  [
    ["11", "Acid - Resistance"],
    ["10", "Necrotic - Resistance"],
    ["27", "Acid - Immunity"],
    ["30", "Poison - Immunity"],
    ["43", "Acid - Vulnerability"],
  ].map(([value, text]) => ({ value: value!, text: text!, selected: selected.includes(value!) }));

const CONDITIONS = (selected: string[]): SelectOption[] =>
  [
    ["2", "Charmed"],
    ["5", "Frightened"],
  ].map(([value, text]) => ({ value: value!, text: text!, selected: selected.includes(value!) }));

function stubAdapter(damage: string[], conditions: string[]) {
  const calls = { damage: [] as string[][], condition: [] as string[][] };
  return {
    calls,
    adapter: {
      damageAdjustmentOptions: () => DAMAGE(damage),
      setDamageAdjustments: (v: string[]) => calls.damage.push(v),
      conditionImmunityOptions: () => CONDITIONS(conditions),
      setConditionImmunities: (v: string[]) => calls.condition.push(v),
    },
  };
}

const click = (el: Element) => el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));

const labels = (scope: ParentNode): string[] =>
  [...scope.querySelectorAll(".cp-option")].map((n) => n.textContent ?? "");

test("the menu offers only the row's own kind, minus what's taken", () => {
  const monster: Monster = { ...emptyMonster(), damageResistances: ["Necrotic"] };
  const block = render5e(monster);
  const { adapter } = stubAdapter(["10"], []);
  wireAdjustments(block, adapter, () => {});

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="damageResistances"]')!;
  assert.deepEqual(labels(row), ["Acid"]); // the other resistance; no immunities
});

test("adding keeps the other damage kinds' values untouched", () => {
  // A creature with an acid immunity gaining a necrotic resistance must not
  // lose the immunity — they share one select.
  const monster: Monster = { ...emptyMonster(), damageImmunities: ["Acid"] };
  const block = render55e(monster, { revealed: new Set(["damageResistances"]) });
  const { adapter, calls } = stubAdapter(["27"], []);
  wireAdjustments(block, adapter, () => {});

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="damageResistances"]')!;
  const item = [...row.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Necrotic"),
  )!;
  click(item);

  assert.deepEqual(calls.damage, [["27", "10"]]);
});

test("removing a chip commits the set without that value", () => {
  const monster: Monster = { ...emptyMonster(), damageResistances: ["Acid", "Necrotic"] };
  const block = render5e(monster);
  const { adapter, calls } = stubAdapter(["11", "10"], []);
  wireAdjustments(block, adapter, () => {});

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="damageResistances"]')!;
  click(row.querySelector(".sb-chip-remove")!); // the Acid chip

  assert.deepEqual(calls.damage, [["10"]]);
});

test("5.5e's merged Immunities row writes each chip back to its own select", () => {
  const monster: Monster = {
    ...emptyMonster(),
    damageImmunities: ["Poison"],
    conditionImmunities: ["Charmed"],
  };
  const block = render55e(monster);
  const { adapter, calls } = stubAdapter(["30"], ["2"]);
  wireAdjustments(block, adapter, () => {});

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="immunities"]')!;
  const removes = row.querySelectorAll(".sb-chip-remove");
  click(removes[1]!); // Charmed — the condition chip
  click(removes[0]!); // Poison — the damage chip

  assert.deepEqual(calls.condition, [[]]);
  assert.deepEqual(calls.damage, [[]]);
  // Both lists are on offer, damage first, in print order.
  assert.deepEqual(labels(row), ["Acid", "Frightened"]);
});

test("a row with nothing left to add drops its affordance", () => {
  const monster: Monster = { ...emptyMonster(), conditionImmunities: ["Charmed", "Frightened"] };
  const block = render5e(monster);
  const { adapter } = stubAdapter([], ["2", "5"]);
  wireAdjustments(block, adapter, () => {});

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="conditionImmunities"]')!;
  assert.equal(row.querySelector(".sb-chip-menu"), null);
  assert.equal(row.querySelectorAll(".sb-chip").length, 2);
});

test("every commit requests a save", () => {
  const monster: Monster = { ...emptyMonster(), damageResistances: ["Acid"] };
  const block = render5e(monster);
  const { adapter } = stubAdapter(["11"], []);
  let saves = 0;
  wireAdjustments(block, adapter, () => (saves += 1));

  const row = block.querySelector<HTMLElement>('.sb-chips[data-field="damageResistances"]')!;
  click(row.querySelector(".sb-chip-remove")!);

  assert.equal(saves, 1);
});
