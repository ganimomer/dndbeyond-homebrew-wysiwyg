import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { SavingThrowsRow } from "./SavingThrowsRow.js";

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

function setup(
  t: import("node:test").TestContext,
  saves: Partial<Record<string, number>>,
  selected: string[],
) {
  const { adapter, calls } = stubAdapter(selected);
  const view = renderInShadowRoot(t, <SavingThrowsRow monster={vampire(saves)} adapter={adapter} />);
  return { ...view, calls };
}

test("renders a chip per proficient save and offers the rest in the menu", (t) => {
  const { root } = setup(t, { dex: 9, con: 9 }, [VALUE.DEX, VALUE.CON]);

  assert.deepEqual(
    [...root.querySelectorAll(".sb-chip")].map((c) => c.textContent),
    ["DEX +9×", "CON +9×"],
  );
  // Each offer shows the bonus it would have: modifier plus PB.
  assert.deepEqual(
    [...root.querySelectorAll(".cp-option")].map((n) => n.textContent),
    ["STR +10", "INT +8", "WIS +7", "CHA +9"],
  );
});

test("picking from the menu commits the set plus that ability", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, { dex: 9 }, [VALUE.DEX]);

  await user.click(root.querySelector<HTMLElement>(".cp-trigger.add")!);
  const wis = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("WIS"),
  )!;
  await user.click(wis);

  assert.deepEqual(calls, [[VALUE.DEX, VALUE.WIS]]);
});

test("removing a chip commits the set without that ability", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, { dex: 9, con: 9 }, [VALUE.DEX, VALUE.CON]);

  await user.click(root.querySelector<HTMLElement>(".sb-chip-remove")!); // the DEX chip

  assert.deepEqual(calls, [[VALUE.CON]]);
});

test("renders the row with just the ＋ when nothing is proficient", (t) => {
  const { root } = setup(t, {}, []);

  assert.equal(root.querySelectorAll(".sb-chip").length, 0);
  assert.equal(root.querySelectorAll(".cp-option").length, 6);
});

test("drops the ＋ once every save is proficient", (t) => {
  const all = { str: 10, dex: 9, con: 9, int: 8, wis: 7, cha: 9 };
  const { root } = setup(t, all, Object.values(VALUE));

  assert.equal(root.querySelector(".sb-chip-menu"), null);
});
