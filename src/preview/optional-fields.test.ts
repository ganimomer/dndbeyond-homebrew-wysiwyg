import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { Monster } from "../statblock/model.js";

// The renderers build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render5e } = await import("./render-5e.js");
const { render55e } = await import("./render-55e.js");
const { hiddenFields, tidbitFields } = await import("./optional-fields.js");
const { emptyMonster } = await import("../statblock/model.js");

/** The optional rows currently on the block, in print order. */
const rows = (block: HTMLElement): string[] =>
  [...block.querySelectorAll<HTMLElement>(".basics .line[data-row]")].map((l) => l.dataset.row!);

for (const [name, render, ruleset] of [
  ["5e", render5e, "5e"],
  ["5.5e", render55e, "5.5e"],
] as const) {
  test(`${name} prints no optional row a blank creature has no value for`, () => {
    const block = render(emptyMonster());

    assert.deepEqual(rows(block), []);
    // The rows that aren't optional are still there.
    assert.ok(block.querySelector('.sb-chips[data-field="movements"]'), "Speed");
    assert.ok(block.querySelector('.sb-chips[data-field="hitPoints"]'), "HP");
  });

  // Languages is a component now, so what the renderer owes is the hole it goes
  // in; the field's own markup and behaviour are TextRow.test.tsx's business.
  test(`${name} prints a row once the creature has a value for it`, () => {
    const block = render({ ...emptyMonster(), languages: "Common" });

    assert.deepEqual(rows(block), ["languages"]);
    assert.ok(block.querySelector('[data-island="languages"]'), "leaves the field a place");
  });

  test(`${name} prints a revealed row empty, ready to fill in`, () => {
    const block = render(emptyMonster(), { revealed: new Set(["languages" as const]) });

    assert.deepEqual(rows(block), ["languages"]);
    assert.ok(block.querySelector('[data-island="languages"]'));
  });

  test(`${name} keeps every optional row in the layout's print order`, () => {
    const monster: Monster = {
      ...emptyMonster(),
      savingThrows: { dex: 5 },
      skills: { Stealth: 6 },
      damageVulnerabilities: ["Fire"],
      damageResistances: ["Cold"],
      damageImmunities: ["Poison"],
      conditionImmunities: ["Charmed"],
      gear: "Longsword",
      senses: [{ type: "Darkvision", note: "60 ft." }],
      languages: "Common",
    };

    assert.deepEqual(
      rows(render(monster)),
      tidbitFields(ruleset).map((spec) => spec.key),
    );
  });

  test(`${name} offers exactly the missing fields, and only while some are missing`, () => {
    const block = render(emptyMonster());
    const hidden = hiddenFields(emptyMonster(), undefined, ruleset);

    assert.ok(block.querySelector(".add-field"), "the Add… footer is present");
    // Everything the blank creature lacks — and nothing it already prints.
    assert.ok(hidden.some((s) => s.key === "skills"));
    assert.ok(!hidden.some((s) => s.key === "size"), "size has a value");

    const full: Monster = {
      ...emptyMonster(),
      subTypes: ["elf"],
      savingThrows: { dex: 5 },
      skills: { Stealth: 6 },
      damageVulnerabilities: ["Fire"],
      damageResistances: ["Cold"],
      damageImmunities: ["Poison"],
      conditionImmunities: ["Charmed"],
      gear: "Longsword",
      senses: [{ type: "Darkvision", note: "60 ft." }],
      languages: "Common",
    };
    assert.deepEqual(hiddenFields(full, undefined, ruleset), []);
    assert.equal(render(full).querySelector(".add-field"), null, "nothing left to add");
  });

  test(`${name} composes the meta line from the slots that have values`, () => {
    const shown = (m: Partial<Monster>) =>
      render({ ...emptyMonster(), ...m }).querySelector(".meta")?.textContent;

    // Every value is a chip, so each drags its ✕ along into the text; what's
    // being read here is the sentence the separators make of them.
    assert.equal(shown({ alignment: "" }), "Medium× humanoid×");
    assert.equal(shown({ size: "", type: "" }), "unaligned×");
    // The subtype's parenthetical hugs the type it qualifies (the trailing
    // "add…" box is the chip editor's, not the sentence's).
    assert.equal(
      shown({ subTypes: ["elf"] })?.replace(/\s+/g, " "),
      "Medium× humanoid× (elf× ), unaligned×",
    );
    // Nothing at all rather than an empty italic line of stray separators.
    assert.equal(shown({ size: "", type: "", alignment: "" }), undefined);
  });
}

test("5.5e prints damage and condition immunities as one row", () => {
  const block = render55e({
    ...emptyMonster(),
    damageImmunities: ["Poison"],
    conditionImmunities: ["Charmed"],
  });

  // One row, not two. Which values it draws from either select, and where a
  // removal is written back to, is AdjustmentsRow.test.tsx's business.
  assert.deepEqual(rows(block), ["immunities"]);
  assert.ok(block.querySelector('[data-island="immunities"]'));
});

test("5e prints damage and condition immunities as two rows", () => {
  const block = render5e({
    ...emptyMonster(),
    damageImmunities: ["Poison"],
    conditionImmunities: ["Charmed"],
  });

  assert.deepEqual(rows(block), ["damageImmunities", "conditionImmunities"]);
});
