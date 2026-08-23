import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCE_KINDS,
  entitiesOf,
  kindByMacro,
  kindsMatching,
} from "./reference-catalog.js";
import { refToTarget } from "./ddb-reference-map.js";

/**
 * What the "add a reference" menu offers. Every fact here is about the
 * harvested tables, so a compendium that grows or a name DDB rewords shows up
 * as a failure here rather than as a menu row nobody can explain.
 */

test("every kind's macro resolves back to its own compendium", () => {
  // The load-bearing invariant: whatever macro we *write* must be one
  // `refToTarget` can read, or the reference we just inserted would never get
  // a tooltip. This is the only thing tying the two tables together.
  for (const kind of REFERENCE_KINDS) {
    assert.equal(
      refToTarget({ ref: kind.macro, text: "Anything" })?.path,
      kind.path,
      `${kind.macro} should reach ${kind.path}`,
    );
  }
});

test("the kinds are the six shipped compendiums, and the two that are a search", () => {
  assert.deepEqual(
    REFERENCE_KINDS.map((kind) => kind.path),
    [
      "spells",
      "monsters",
      "conditions",
      "skills",
      "senses",
      "actions",
      "weapon-properties",
      "rules-glossary",
    ],
  );
  assert.deepEqual(
    REFERENCE_KINDS.filter((kind) => kind.source === "listing").map((kind) => kind.path),
    ["spells", "monsters"],
  );
});

test("a listing kind has no rows to list", () => {
  // Nothing is wrong here: a spell can't be enumerated without asking DDB, and
  // the menu is expected to read `source` rather than an empty array.
  assert.deepEqual(entitiesOf("spells"), []);
  assert.deepEqual(entitiesOf("monsters"), []);
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
        refToTarget({ ref: kind.macro, text: entity.name })?.slug,
        entity.slug,
        `${kind.path}: ${entity.name}`,
      );
    }
  }
});

test("kindByMacro finds a kind by the macro it writes", () => {
  assert.equal(kindByMacro("condition")?.path, "conditions");
  assert.equal(kindByMacro("spells")?.path, "spells");
  assert.equal(kindByMacro("monsters")?.path, "monsters");
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
