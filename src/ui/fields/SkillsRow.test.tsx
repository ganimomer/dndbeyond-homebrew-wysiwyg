import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { SkillsRow } from "./SkillsRow.js";

/** A subset of DDB's list, with real ids, standing in for skillOptions(). */
const OPTIONS = (taken: string[]): SelectOption[] =>
  (
    [
      ["3", "Acrobatics"],
      ["5", "Stealth"],
      ["14", "Perception"],
      ["17", "Intimidation"],
    ] as const
  ).map(([value, text]) => ({ value, text, selected: taken.includes(text) }));

function stubAdapter(taken: string[]) {
  const calls = { added: [] as Array<[string, number]>, removed: [] as string[] };
  const adapter = {
    skillOptions: () => OPTIONS(taken),
    addSkill: (value: string, bonus: number) => {
      calls.added.push([value, bonus]);
      return Promise.resolve();
    },
    removeSkill: (name: string) => {
      calls.removed.push(name);
      return Promise.resolve();
    },
  };
  return { adapter, calls };
}

/** WIS 16 (+3), DEX 8 (−1), CHA 14 (+2), CR 5 (PB +3). */
function monsterWith(skills: Record<string, number>): Monster {
  const monster = { ...emptyMonster(), challengeRating: "5", skills };
  monster.abilities = { ...monster.abilities, wis: 16, dex: 8, cha: 14 };
  return monster;
}

function setup(t: import("node:test").TestContext, skills: Record<string, number>) {
  const monster = monsterWith(skills);
  const { adapter, calls } = stubAdapter(Object.keys(skills));
  const view = renderInShadowRoot(t, <SkillsRow monster={monster} adapter={adapter} />);
  const labels = () => [...view.root.querySelectorAll(".cp-option")].map((n) => n.textContent);
  return { ...view, monster, calls, labels };
}

test("renders a chip per skill, showing the bonus D&D Beyond has stored", (t) => {
  const { root } = setup(t, { Perception: 9, Stealth: 2 });

  const chips = [...root.querySelectorAll(".sb-chip")].map((c) => [
    (c as HTMLElement).dataset.value,
    c.querySelector(".sb-chip-detail")?.textContent,
  ]);
  // +9 is kept even though the computed value would be +6: it may be deliberate.
  assert.deepEqual(chips, [
    ["Perception", "+9"],
    ["Stealth", "+2"],
  ]);
});

test("the menu offers only the skills the creature lacks, with the bonus we'd write", (t) => {
  const { labels } = setup(t, { Perception: 9 });

  assert.deepEqual(labels(), [
    "Acrobatics (DEX) +2", // −1 mod, +3 PB
    "Stealth (DEX) +2",
    "Intimidation (CHA) +5", // +2 mod, +3 PB
  ]);
});

test("picking a skill adds it with the computed bonus", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, {});

  await user.click(root.querySelector<HTMLElement>(".cp-trigger.add")!);
  const perception = [...root.querySelectorAll<HTMLElement>(".cp-option")].find((li) =>
    li.textContent?.startsWith("Perception"),
  )!;
  await user.click(perception);

  assert.deepEqual(calls.added, [["14", 6]]); // +3 mod, +3 PB
});

test("a chip's ✕ removes that skill", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, { Stealth: 2 });

  await user.click(root.querySelector<HTMLElement>(".sb-chip-remove")!);

  assert.deepEqual(calls.removed, ["Stealth"]);
});

test("a creature with no skills still gets the add menu", (t) => {
  const { root, labels } = setup(t, {});

  assert.equal(root.querySelectorAll(".sb-chip").length, 0);
  assert.equal(labels().length, 4);
});

test("the add affordance disappears once every skill is taken", (t) => {
  const taken = ["Acrobatics", "Stealth", "Perception", "Intimidation"];
  const { root } = setup(t, Object.fromEntries(taken.map((name) => [name, 0])));

  assert.equal(root.querySelector(".sb-chip-menu"), null);
});

test("the row freezes while a write is in flight, so a second click can't race it", (t) => {
  const monster = monsterWith({ Stealth: 2 });
  let settle: (() => void) | undefined;
  const adapter = {
    skillOptions: () => OPTIONS(["Stealth"]),
    addSkill: () => Promise.resolve(),
    removeSkill: () => new Promise<void>((resolve) => (settle = resolve)),
  };
  const { root } = renderInShadowRoot(t, <SkillsRow monster={monster} adapter={adapter} />);
  const row = () => root.querySelector(".sb-chips")!;

  assert.equal(row().classList.contains("is-busy"), false);
  root.querySelector<HTMLElement>(".sb-chip-remove")!.click();

  assert.equal(row().classList.contains("is-busy"), true, "frozen while the request is out");
  settle?.();
});

test("a row added from the Add… menu arrives with its menu already down", (t) => {
  const monster = monsterWith({});
  const { root } = renderInShadowRoot(
    t,
    <SkillsRow monster={monster} adapter={stubAdapter([]).adapter} autoOpen />,
  );

  // Adding the row is always a prelude to picking something; a shut dropdown
  // would just cost another click.
  assert.ok(root.querySelector(".cp.open"), "the picker is open on arrival");
});
