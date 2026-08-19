import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";

// skills-line + context-menu build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { skillsChips } = await import("../preview/skills-line.js");
const { wireSkills } = await import("./skills-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

/** A subset of DDB's list, with real ids, standing in for skillOptions(). */
const OPTIONS = (taken: string[]): SelectOption[] =>
  [
    ["3", "Acrobatics"],
    ["5", "Stealth"],
    ["14", "Perception"],
    ["17", "Intimidation"],
  ].map(([value, text]) => ({ value: value!, text: text!, selected: taken.includes(text!) }));

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

/** WIS 16 (+3), DEX 8 (−1), CR 5 (PB +3). */
function monsterWith(skills: Record<string, number>): Monster {
  const monster = { ...emptyMonster(), challengeRating: "5", skills };
  monster.abilities = { ...monster.abilities, wis: 16, dex: 8, cha: 14 };
  return monster;
}

function scopeFor(monster: Monster): HTMLElement {
  const root = jsdom.window.document.createElement("div");
  root.append(skillsChips(monster));
  return root;
}

const labels = (scope: ParentNode) =>
  [...scope.querySelectorAll(".cm-item .cm-label")].map((n) => n.textContent);

test("renders a chip per skill, showing the bonus D&D Beyond has stored", () => {
  const scope = scopeFor(monsterWith({ Perception: 9, Stealth: 2 }));

  const chips = [...scope.querySelectorAll(".sb-chip")].map((c) => [
    (c as HTMLElement).dataset.value,
    c.querySelector(".sb-chip-detail")?.textContent,
  ]);
  // +9 is kept even though the computed value would be +6: it may be deliberate.
  assert.deepEqual(chips, [
    ["Perception", "+9"],
    ["Stealth", "+2"],
  ]);
});

test("the menu offers only the skills the creature lacks, with the bonus we'd write", () => {
  const monster = monsterWith({ Perception: 9 });
  const scope = scopeFor(monster);
  const { adapter } = stubAdapter(["Perception"]);
  wireSkills(scope, monster, adapter);

  assert.deepEqual(labels(scope), [
    "Acrobatics (DEX) +2", // −1 mod, +3 PB
    "Stealth (DEX) +2",
    "Intimidation (CHA) +5", // +2 mod, +3 PB
  ]);
});

test("picking a skill adds it with the computed bonus", () => {
  const monster = monsterWith({});
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter([]);
  wireSkills(scope, monster, adapter);

  const perception = [...scope.querySelectorAll<HTMLElement>(".cm-item")].find((li) =>
    li.textContent?.startsWith("Perception"),
  )!;
  perception.dispatchEvent(new jsdom.window.Event("click"));

  assert.deepEqual(calls.added, [["14", 6]]); // +3 mod, +3 PB
});

test("a chip's ✕ removes that skill", () => {
  const monster = monsterWith({ Stealth: 2 });
  const scope = scopeFor(monster);
  const { adapter, calls } = stubAdapter(["Stealth"]);
  wireSkills(scope, monster, adapter);

  scope
    .querySelector<HTMLButtonElement>(".sb-chip-remove")!
    .dispatchEvent(new jsdom.window.Event("click"));

  assert.deepEqual(calls.removed, ["Stealth"]);
});

test("a creature with no skills still gets the add menu", () => {
  const monster = monsterWith({});
  const scope = scopeFor(monster);
  wireSkills(scope, monster, stubAdapter([]).adapter);

  assert.equal(scope.querySelectorAll(".sb-chip").length, 0);
  assert.equal(labels(scope).length, 4);
});

test("the add affordance disappears once every skill is taken", () => {
  const taken = ["Acrobatics", "Stealth", "Perception", "Intimidation"];
  const monster = monsterWith(Object.fromEntries(taken.map((t) => [t, 0])));
  const scope = scopeFor(monster);
  wireSkills(scope, monster, stubAdapter(taken).adapter);

  assert.equal(scope.querySelector(".sb-chip-menu"), null);
});
