import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Ability, type Monster } from "../../statblock/model.js";
import { fireEvent, renderInShadowRoot } from "../../test-support/render.js";
import { AbilityScores } from "./AbilityScores.js";

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
  { ruleset = "5.5e" as const, saves = {}, selected = [] as string[] } = {},
) {
  const { adapter, calls } = stubAdapter(selected);
  const committed: Array<[Ability, number]> = [];
  const view = renderInShadowRoot(
    t,
    <AbilityScores
      monster={vampire(saves)}
      ruleset={ruleset}
      adapter={adapter}
      onCommit={(ability, score) => committed.push([ability, score])}
    />,
  );
  const score = (ability: string) =>
    view.root.querySelector<HTMLInputElement>(`.score-input[data-ability="${ability}"]`)!;
  const mod = (ability: string) => view.root.querySelector(`[data-mod="${ability}"]`)?.textContent;
  const save = (ability: string) =>
    view.root.querySelector(`[data-save="${ability}"]`)?.textContent;
  const toggle = (ability: string) =>
    view.root.querySelector<HTMLButtonElement>(`.save-toggle[data-save-toggle="${ability}"]`)!;
  return { ...view, calls, committed, score, mod, save, toggle };
}

test("5.5e prints both tables, with a score box and a modifier per ability", (t) => {
  const { root, score, mod } = setup(t);

  assert.equal(root.querySelectorAll(".stat-table").length, 2);
  assert.equal(score("str").value, "20");
  assert.equal(mod("str"), "+5");
  assert.equal(mod("wis"), "+2");
});

test("5e prints one row of six cells", (t) => {
  const { root, score, mod } = setup(t, { ruleset: "5e" });

  assert.equal(root.querySelectorAll(".ability-block .stat").length, 6);
  assert.equal(score("dex").value, "18");
  assert.equal(mod("dex"), "+4");
});

test("typing moves the modifier without committing anything", (t) => {
  const { score, mod, committed } = setup(t);

  const box = score("dex");
  box.value = "20";
  fireEvent.input(box);

  assert.equal(mod("dex"), "+5", "the modifier keeps up as you type");
  assert.deepEqual(committed, [], "but nothing is written back yet");
});

test("the score commits when the user is done", (t) => {
  const { score, committed } = setup(t);

  const box = score("dex");
  box.value = "20";
  fireEvent.change(box);

  assert.deepEqual(committed, [["dex", 20]]);
});

test("an unusable score falls back to the one it had", (t) => {
  const { score, committed } = setup(t);

  const box = score("dex");
  box.value = "";
  fireEvent.change(box);

  assert.equal(box.value, "18", "normalized back to what's stored");
  assert.deepEqual(committed, []);
});

test("the derived Save keeps up with the score as it's typed", (t) => {
  const { score, save } = setup(t, { saves: { dex: 9 }, selected: [VALUE.DEX] });

  assert.equal(save("dex"), "+9"); // +4 mod, +5 PB
  const box = score("dex");
  box.value = "20";
  fireEvent.input(box);

  assert.equal(save("dex"), "+10");
});

test("a Save the author overrode by hand stays where they put it", (t) => {
  // 15 is neither the modifier nor mod + PB, so it was set deliberately.
  const { score, save } = setup(t, { saves: { dex: 15 }, selected: [VALUE.DEX] });

  const box = score("dex");
  box.value = "20";
  fireEvent.input(box);

  assert.equal(save("dex"), "+15", "left alone");
});

test("a proficiency dot toggles that save, committing the whole set", (t) => {
  const { toggle, calls } = setup(t, { saves: { dex: 9 }, selected: [VALUE.DEX] });

  assert.equal(toggle("dex").getAttribute("aria-pressed"), "true");
  assert.equal(toggle("wis").getAttribute("aria-pressed"), "false");

  fireEvent.click(toggle("wis"));
  assert.deepEqual(calls, [[VALUE.DEX, VALUE.WIS]]);

  fireEvent.click(toggle("dex"));
  assert.deepEqual(calls[1], []);
});

test("editing a score leaves the proficiency dot intact", (t) => {
  const { score, save, toggle } = setup(t, { saves: { dex: 9 }, selected: [VALUE.DEX] });

  const box = score("dex");
  box.value = "20";
  fireEvent.input(box);

  // The number lives in its own span precisely so rewriting it can't take the
  // icon beside it.
  assert.equal(save("dex"), "+10");
  assert.ok(toggle("dex").querySelector("svg"), "proficiency dot survived");
});

test("each score carries the focus key the panel restores to", (t) => {
  const { score } = setup(t);

  assert.equal(score("cha").dataset.focusKey, "score:cha");
});
