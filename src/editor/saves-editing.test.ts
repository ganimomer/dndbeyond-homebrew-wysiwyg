import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";

// The renderers build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render5e } = await import("../preview/render-5e.js");
const { render55e } = await import("../preview/render-55e.js");
const { wireSavingThrows } = await import("./saves-editing.js");
const { wireAbilityInputs } = await import("./ability-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

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
const click = (el: Element) => el.dispatchEvent(new jsdom.window.Event("click"));

// ---------------------------------------------------------------- 5.5e toggles

test("5.5e renders a proficiency dot per ability, pressed only where proficient", () => {
  const block = render55e(vampire({ dex: 9, con: 9 }));
  const state = ["str", "dex", "con", "int", "wis", "cha"].map(
    (a) => toggle(block, a).getAttribute("aria-pressed"),
  );

  assert.deepEqual(state, ["false", "true", "true", "false", "false", "false"]);
});

test("5.5e toggling a non-proficient save commits the set plus it", () => {
  const monster = vampire({ dex: 9, con: 9 });
  const block = render55e(monster);
  const { adapter, calls } = stubAdapter([VALUE.DEX, VALUE.CON]);
  wireSavingThrows(block, monster, adapter);

  click(toggle(block, "wis"));

  assert.deepEqual(calls, [[VALUE.DEX, VALUE.CON, VALUE.WIS]]);
});

test("5.5e toggling a proficient save commits the set without it", () => {
  const monster = vampire({ dex: 9, con: 9 });
  const block = render55e(monster);
  const { adapter, calls } = stubAdapter([VALUE.DEX, VALUE.CON]);
  wireSavingThrows(block, monster, adapter);

  click(toggle(block, "dex"));

  assert.deepEqual(calls, [[VALUE.CON]]);
});

test("5.5e shows the modifier when not proficient and mod + PB when proficient", () => {
  const block = render55e(vampire({ dex: 9 }));
  const text = (a: string) => block.querySelector(`[data-save="${a}"]`)?.textContent;

  assert.equal(text("dex"), "+9"); // +4 mod, +5 PB
  assert.equal(text("wis"), "+2"); // modifier only
});

// ------------------------------------------------------------------ 5e chips

test("5e renders a chip per proficient save and offers the rest in the menu", () => {
  const monster = vampire({ dex: 9, con: 9 });
  const block = render5e(monster);
  wireSavingThrows(block, monster, stubAdapter([VALUE.DEX, VALUE.CON]).adapter);
  const saves = block.querySelector('.sb-chips[data-field="saves"]')!;

  assert.deepEqual(
    [...saves.querySelectorAll(".sb-chip")].map((c) => c.textContent),
    ["DEX +9×", "CON +9×"],
  );
  assert.deepEqual(
    [...saves.querySelectorAll(".cm-item .cm-label")].map((n) => n.textContent),
    ["STR +10", "INT +8", "WIS +7", "CHA +9"],
  );
});

test("5e picking from the menu commits the set plus that ability", () => {
  const monster = vampire({ dex: 9 });
  const block = render5e(monster);
  const { adapter, calls } = stubAdapter([VALUE.DEX]);
  wireSavingThrows(block, monster, adapter);

  const item = [...block.querySelectorAll<HTMLElement>(".cm-item")].find((li) =>
    li.textContent?.startsWith("WIS"),
  )!;
  click(item);

  assert.deepEqual(calls, [[VALUE.DEX, VALUE.WIS]]);
});

test("5e removing a chip commits the set without that ability", () => {
  const monster = vampire({ dex: 9, con: 9 });
  const block = render5e(monster);
  const { adapter, calls } = stubAdapter([VALUE.DEX, VALUE.CON]);
  wireSavingThrows(block, monster, adapter);

  const saves = block.querySelector('.sb-chips[data-field="saves"]')!;
  click(saves.querySelector(".sb-chip-remove")!); // the DEX chip

  assert.deepEqual(calls, [[VALUE.CON]]);
});

test("5e renders the row with just the ＋ when nothing is proficient", () => {
  const monster = vampire();
  const block = render5e(monster);
  wireSavingThrows(block, monster, stubAdapter([]).adapter);
  const saves = block.querySelector('.sb-chips[data-field="saves"]')!;

  assert.equal(saves.querySelectorAll(".sb-chip").length, 0);
  assert.equal(saves.querySelectorAll(".cm-item").length, 6);
});

// ------------------------------------------------------------------ regression

test("editing a score updates the Save number without destroying its dot", () => {
  const monster = vampire({ dex: 9 });
  const block = render55e(monster);
  wireAbilityInputs(block, monster, () => {});

  const input = block.querySelector<HTMLInputElement>('.score-input[data-ability="dex"]')!;
  input.value = "20";
  input.dispatchEvent(new jsdom.window.Event("input"));

  // The number lives in its own span precisely so this textContent write can't
  // take the icon with it.
  assert.equal(block.querySelector('[data-save="dex"]')?.textContent, "+10");
  assert.ok(toggle(block, "dex").querySelector("svg"), "proficiency dot survived");
});
