import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import type { AdjustmentField } from "../../statblock/adjustments.js";
import { renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { AdjustmentsRow } from "./AdjustmentsRow.js";

// DDB packs all three damage adjustments into one select, labelled "X - Kind".
const DAMAGE = (selected: string[]): SelectOption[] =>
  (
    [
      ["11", "Acid - Resistance"],
      ["10", "Necrotic - Resistance"],
      ["27", "Acid - Immunity"],
      ["30", "Poison - Immunity"],
      ["43", "Acid - Vulnerability"],
    ] as const
  ).map(([value, text]) => ({ value, text, selected: selected.includes(value) }));

const CONDITIONS = (selected: string[]): SelectOption[] =>
  (
    [
      ["2", "Charmed"],
      ["5", "Frightened"],
    ] as const
  ).map(([value, text]) => ({ value, text, selected: selected.includes(value) }));

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

function setup(
  t: import("node:test").TestContext,
  field: AdjustmentField,
  monster: Partial<Monster>,
  damage: string[],
  conditions: string[],
) {
  const { adapter, calls } = stubAdapter(damage, conditions);
  const view = renderInShadowRoot(
    t,
    <AdjustmentsRow monster={{ ...emptyMonster(), ...monster }} field={field} adapter={adapter} />,
  );
  const labels = () => [...view.root.querySelectorAll(".cp-option")].map((n) => n.textContent ?? "");
  return { ...view, calls, labels };
}

test("the menu offers only the row's own kind, minus what's taken", (t) => {
  const { labels } = setup(t, "damageResistances", { damageResistances: ["Necrotic"] }, ["10"], []);

  assert.deepEqual(labels(), ["Acid"]); // the other resistance; no immunities
});

test("adding keeps the other damage kinds' values untouched", async (t) => {
  const user = userEvent.setup();
  // A creature with an acid immunity gaining a necrotic resistance must not
  // lose the immunity — they share one select.
  const { root, calls } = setup(t, "damageResistances", { damageImmunities: ["Acid"] }, ["27"], []);

  await user.click(root.querySelector<HTMLElement>(".cp-trigger.add")!);
  const necrotic = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Necrotic"),
  )!;
  await user.click(necrotic);

  assert.deepEqual(calls.damage, [["27", "10"]]);
});

test("removing a chip commits the set without that value", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(
    t,
    "damageResistances",
    { damageResistances: ["Acid", "Necrotic"] },
    ["11", "10"],
    [],
  );

  await user.click(root.querySelector<HTMLElement>(".sb-chip-remove")!); // the Acid chip

  assert.deepEqual(calls.damage, [["10"]]);
});

test("5.5e's merged Immunities row writes each chip back to its own select", async (t) => {
  const user = userEvent.setup();
  const { root, calls, labels } = setup(
    t,
    "immunities",
    { damageImmunities: ["Poison"], conditionImmunities: ["Charmed"] },
    ["30"],
    ["2"],
  );

  // Damage first, then conditions — the order the row prints them in.
  assert.deepEqual(
    [...root.querySelectorAll<HTMLElement>(".sb-chip")].map((c) => c.dataset.value),
    ["Poison", "Charmed"],
  );

  const removes = root.querySelectorAll<HTMLElement>(".sb-chip-remove");
  await user.click(removes[1]!); // Charmed — the condition chip
  await user.click(removes[0]!); // Poison — the damage chip

  assert.deepEqual(calls.condition, [[]]);
  assert.deepEqual(calls.damage, [[]]);
  // Both lists are on offer, damage first, in print order.
  assert.deepEqual(labels(), ["Acid", "Frightened"]);
});

test("a row with nothing left to add drops its affordance", (t) => {
  const { root } = setup(
    t,
    "conditionImmunities",
    { conditionImmunities: ["Charmed", "Frightened"] },
    [],
    ["2", "5"],
  );

  assert.equal(root.querySelector(".sb-chip-menu"), null);
  assert.equal(root.querySelectorAll(".sb-chip").length, 2);
});

test("the ＋ answers to the focus key the field registry promises", (t) => {
  const { root } = setup(t, "damageResistances", {}, [], []);

  // The registry points a just-revealed row at `add:<field>`; if the two ever
  // disagreed the caret would silently land nowhere.
  assert.ok(root.querySelector('[data-focus-key="add:damageResistances"]'));
});
