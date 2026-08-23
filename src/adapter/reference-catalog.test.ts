import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCE_KINDS,
  entitiesOf,
  kindByMacro,
  kindsMatching,
  rowTarget,
} from "./reference-catalog.js";
import { refToTargets } from "./ddb-reference-map.js";

/**
 * What the "add a reference" menu offers. Every fact here is about the
 * harvested tables, so a compendium that grows or a name DDB rewords shows up
 * as a failure here rather than as a menu row nobody can explain.
 */

test("every kind's macro resolves back to its own compendium", () => {
  // The load-bearing invariant: whatever macro we *write* must be one
  // `refToTargets` can read, or the reference we just inserted would never get
  // a tooltip. This is the only thing tying the two tables together.
  for (const kind of REFERENCE_KINDS) {
    assert.equal(
      refToTargets({ ref: kind.macro, text: "Anything" })[0]?.path,
      kind.path,
      `${kind.macro} should reach ${kind.path}`,
    );
  }
});

test("the kinds are the seven shipped compendiums, and the four that are a search", () => {
  assert.deepEqual(
    REFERENCE_KINDS.map((kind) => kind.path),
    [
      "spells",
      "monsters",
      "magic-items",
      "conditions",
      "skills",
      "senses",
      "actions",
      "weapon-properties",
      "rules-glossary",
      "adventuring-gear",
      "vehicles",
    ],
  );
  assert.deepEqual(
    REFERENCE_KINDS.filter((kind) => kind.source === "listing").map((kind) => kind.path),
    ["spells", "monsters", "magic-items", "adventuring-gear"],
  );
});

test("a listing kind has no rows to list", () => {
  // Nothing is wrong here: a spell can't be enumerated without asking DDB, and
  // the menu is expected to read `source` rather than an empty array.
  assert.deepEqual(entitiesOf("spells"), []);
  assert.deepEqual(entitiesOf("monsters"), []);
  assert.deepEqual(entitiesOf("magic-items"), []);
});

test("an alias slug doesn't become a second row", () => {
  // `keysFor` in the harvester emits both `acrobatics` and
  // `dexterity-acrobatics` for id 3, so a naive listing shows 36 skills.
  const skills = entitiesOf("skills");
  assert.equal(skills.length, 18);
  assert.equal(skills.filter((skill) => skill.name === "Acrobatics").length, 1);
});

test("a skill reads the way a stat block says it", () => {
  // DDB names a skill `Dexterity (Acrobatics)`, but prose reads "makes a
  // Acrobatics check" — the ability is already on the line above.
  const acrobatics = entitiesOf("skills").find((skill) => skill.slug === "acrobatics");
  assert.deepEqual(acrobatics, { name: "Acrobatics", slug: "acrobatics" });
});

test("the conditions are the fifteen that exist", () => {
  const conditions = entitiesOf("conditions");
  assert.equal(conditions.length, 15);
  assert.deepEqual(conditions[0], { name: "Blinded", slug: "blinded" });
  assert.ok(conditions.some((condition) => condition.name === "Grappled"));
});

test("the senses drop the one that isn't a sense", () => {
  // `/senses/5` is DDB's "Unknown" placeholder. It resolves, so the harvester
  // keeps it; nobody would ever mean to reference it.
  const senses = entitiesOf("senses");
  assert.deepEqual(
    senses.map((sense) => sense.name),
    ["Blindsight", "Darkvision", "Tremorsense", "Truesight"],
  );
});

test("the vehicles are the closed set their own page can't offer", () => {
  // DDB has a vehicles page, but its cards link to `/vehicles/galley` — no id
  // in the URL, so nothing about a vehicle could be resolved from one. There
  // are 31, so the table carries them instead.
  const vehicles = entitiesOf("vehicles");
  assert.equal(vehicles.length, 31);
  assert.deepEqual(vehicles[0], { name: "Battle Balloon", slug: "battle-balloon" });
  assert.ok(vehicles.some((vehicle) => vehicle.name === "Galley"));
});

test("the glossary is the long list the picker has to filter", () => {
  const rules = entitiesOf("rules-glossary");
  assert.ok(rules.length > 100, `expected a big glossary, got ${rules.length}`);
  assert.ok(rules.some((rule) => rule.name === "Shape-Shifting"));
});

test("entities come out in name order", () => {
  for (const kind of REFERENCE_KINDS) {
    const names = entitiesOf(kind.path).map((entity) => entity.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), kind.path);
  }
});

test("every entity's own name slugifies back to its slug", () => {
  // Which is what lets the inserted macro leave the slug off entirely and
  // still resolve — see `insertReference`.
  for (const kind of REFERENCE_KINDS) {
    for (const entity of entitiesOf(kind.path)) {
      assert.equal(
        refToTargets({ ref: kind.macro, text: entity.name })[0]?.slug,
        entity.slug,
        `${kind.path}: ${entity.name}`,
      );
    }
  }
});

test("one listing serves three compendiums, and a row says which", () => {
  // `/equipment` is gear, armor and weapons at once. DDB says which by the
  // icon it draws, and the suffix is the whole rule — checked against 90 of
  // their own rows.
  const equipment = kindByMacro("equipment")!;
  assert.equal(equipment.listing, "equipment", "not browsed at its own path");

  assert.deepEqual(rowTarget(equipment, "heavy-armor"), { macro: "armor", path: "armor" });
  assert.deepEqual(rowTarget(equipment, "shield"), { macro: "armor", path: "armor" });
  assert.deepEqual(rowTarget(equipment, "simple-melee-weapon"), {
    macro: "weapon",
    path: "weapons",
  });
  assert.deepEqual(rowTarget(equipment, "martial-ranged-weapon"), {
    macro: "weapon",
    path: "weapons",
  });
  // Gear, and anything they invent next, stay with the kind's own compendium.
  for (const category of ["adventuring-gear", "tool", "poison", "mount", undefined, "new-thing"]) {
    assert.deepEqual(
      rowTarget(equipment, category),
      { macro: "equipment", path: "adventuring-gear" },
      String(category),
    );
  }
});

test("a row on a listing that is one compendium keeps that compendium", () => {
  const spells = kindByMacro("spells")!;
  assert.equal(spells.listing, undefined);
  assert.deepEqual(rowTarget(spells, undefined), { macro: "spells", path: "spells" });
});

test("every macro a row can produce is one the reader knows", () => {
  // `rowTarget` writes macros that are in no kind — `armor`, `weapon` — so the
  // round-trip check above doesn't cover them.
  for (const [macro, path] of [
    ["armor", "armor"],
    ["weapon", "weapons"],
  ] as const) {
    assert.equal(refToTargets({ ref: macro, text: "Anything" })[0]?.path, path);
  }
});

test("kindByMacro finds a kind by the macro it writes", () => {
  assert.equal(kindByMacro("condition")?.path, "conditions");
  assert.equal(kindByMacro("spells")?.path, "spells");
  assert.equal(kindByMacro("monsters")?.path, "monsters");
  assert.equal(kindByMacro("items")?.path, "magic-items");
  assert.equal(kindByMacro("spell"), undefined);
});

test("a half-typed command narrows the kinds to what it could still mean", () => {
  assert.deepEqual(
    kindsMatching("con").map((kind) => kind.label),
    ["Condition"],
  );
  assert.deepEqual(
    kindsMatching("s").map((kind) => kind.label),
    ["Spell", "Skill", "Sense"],
  );
});

test("a command narrows on any word of a kind's name", () => {
  // `/property` is as likely a guess as `/weapon`, and neither is the whole
  // label. Matching mid-word is not: `/pro` meaning "Weapon property" would be
  // a coincidence nobody could discover.
  for (const query of ["weapon", "property"]) {
    assert.deepEqual(
      kindsMatching(query).map((kind) => kind.path),
      ["weapon-properties"],
      query,
    );
  }
  assert.deepEqual(kindsMatching("ondition"), []);
});

test("a bare slash offers everything", () => {
  assert.equal(kindsMatching("").length, REFERENCE_KINDS.length);
});
