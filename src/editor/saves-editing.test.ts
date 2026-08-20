import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../adapter/types.js";
import { emptyMonster, type Monster } from "../statblock/model.js";
import { render55e } from "../preview/render-55e.js";
import { wireSaveToggles } from "./saves-editing.js";
import { wireAbilityInputs } from "./ability-editing.js";

/** DDB's real option values: 1..6 = STR..CHA, labelled with the abbreviations. */
const VALUE = { STR: "1", DEX: "2", CON: "3", INT: "4", WIS: "5", CHA: "6" };

function stubAdapter(selected: string[]) {
  const calls: string[][] = [];
  const adapter = {
    savingThrowOptions: (): SelectOption[] =>
      Object.entries(VALUE).map(([text, value]) => ({
        value,
        text,
        selected: selected.includes(value),
      })),
    setSavingThrows: (values: string[]) => calls.push(values),
  };
  return { adapter, calls };
}

/** STR 20 (+5), DEX 18 (+4), WIS 15 (+2), CR 13 → PB +5. */
function vampire(saves: Partial<Record<string, number>> = {}): Monster {
  const monster = { ...emptyMonster(), challengeRating: "13" };
  monster.abilities = { ...monster.abilities, str: 20, dex: 18, con: 18, int: 17, wis: 15, cha: 18 };
  monster.savingThrows = saves as Monster["savingThrows"];
  return monster;
}

const toggle = (scope: ParentNode, ability: string) =>
  scope.querySelector<HTMLButtonElement>(`.save-toggle[data-save-toggle="${ability}"]`)!;
const click = (el: Element) => el.dispatchEvent(new Event("click"));

test("5.5e renders a proficiency dot per ability, pressed only where proficient", () => {
  const block = render55e(vampire({ dex: 9, con: 9 }));
  const state = ["str", "dex", "con", "int", "wis", "cha"].map(
    (a) => toggle(block, a).getAttribute("aria-pressed"),
  );

  assert.deepEqual(state, ["false", "true", "true", "false", "false", "false"]);
});

test("5.5e toggling a non-proficient save commits the set plus it", () => {
  const block = render55e(vampire({ dex: 9, con: 9 }));
  const { adapter, calls } = stubAdapter([VALUE.DEX, VALUE.CON]);
  wireSaveToggles(block, adapter);

  click(toggle(block, "wis"));

  assert.deepEqual(calls, [[VALUE.DEX, VALUE.CON, VALUE.WIS]]);
});

test("5.5e toggling a proficient save commits the set without it", () => {
  const block = render55e(vampire({ dex: 9, con: 9 }));
  const { adapter, calls } = stubAdapter([VALUE.DEX, VALUE.CON]);
  wireSaveToggles(block, adapter);

  click(toggle(block, "dex"));

  assert.deepEqual(calls, [[VALUE.CON]]);
});

test("5.5e shows the modifier when not proficient and mod + PB when proficient", () => {
  const block = render55e(vampire({ dex: 9 }));
  const text = (a: string) => block.querySelector(`[data-save="${a}"]`)?.textContent;

  assert.equal(text("dex"), "+9"); // +4 mod, +5 PB
  assert.equal(text("wis"), "+2"); // modifier only
});

test("editing a score updates the Save number without destroying its dot", () => {
  const monster = vampire({ dex: 9 });
  const block = render55e(monster);
  wireAbilityInputs(block, monster, () => {});

  const input = block.querySelector<HTMLInputElement>('.score-input[data-ability="dex"]')!;
  input.value = "20";
  input.dispatchEvent(new Event("input"));

  // The number lives in its own span precisely so this textContent write can't
  // take the icon with it.
  assert.equal(block.querySelector('[data-save="dex"]')?.textContent, "+10");
  assert.ok(toggle(block, "dex").querySelector("svg"), "proficiency dot survived");
});
