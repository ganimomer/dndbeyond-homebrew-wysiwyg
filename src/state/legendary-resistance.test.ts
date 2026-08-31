/**
 * The Legendary Resistance trait, and the one thing a lair does to it.
 *
 * The 2024 books grant a creature an extra use of Legendary Resistance while
 * it is in its lair, written into the trait's own parenthetical. That makes the
 * parenthetical a small structured field hiding inside prose the author owns —
 * so every test here is about touching as little of it as possible.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster } from "../statblock/model.js";
import {
  findLegendaryResistance,
  legendaryResistanceHtml,
  withLairUses,
  withoutLairUses,
} from "./legendary-resistance.js";

const vampire = (over: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  ...over,
});

test("a lair grants one more use than the creature has outside it", () => {
  assert.equal(withLairUses("Legendary Resistance (3/Day)"), "Legendary Resistance (3/Day, or 4/Day in Lair)");
});

test("and it scales with whatever count the author actually wrote", () => {
  // Fixing the in-lair figure at 4 would leave a 5/Day creature weaker at home.
  assert.equal(withLairUses("Legendary Resistance (5/Day)"), "Legendary Resistance (5/Day, or 6/Day in Lair)");
  assert.equal(withLairUses("Legendary Resistance (1/Day)"), "Legendary Resistance (1/Day, or 2/Day in Lair)");
});

test("a parenthetical that already says so is left exactly alone", () => {
  assert.equal(withLairUses("Legendary Resistance (3/Day, or 4/Day in Lair)"), null);
  assert.equal(withLairUses("Legendary Resistance (3/Day, or 9/Day in lair)"), null);
});

test("a parenthetical with no count to scale is left alone too", () => {
  // Nothing to derive an in-lair figure from, and inventing one would be
  // putting words in the author's mouth.
  assert.equal(withLairUses("Legendary Resistance"), null);
  assert.equal(withLairUses("Legendary Resistance (Recharges at Dawn)"), null);
});

test("whatever else the author put in the brackets comes along", () => {
  assert.equal(
    withLairUses("Legendary Resistance (3/Day, recharges at dawn)"),
    "Legendary Resistance (3/Day, recharges at dawn, or 4/Day in Lair)",
  );
});

test("removing the lair puts the parenthetical back the way it was", () => {
  for (const name of [
    "Legendary Resistance (3/Day)",
    "Legendary Resistance (5/Day)",
    "Legendary Resistance (3/Day, recharges at dawn)",
  ]) {
    assert.equal(withoutLairUses(withLairUses(name)!), name, name);
  }
});

test("and does nothing to a trait that never had the clause", () => {
  assert.equal(withoutLairUses("Legendary Resistance (3/Day)"), null);
  assert.equal(withoutLairUses("Legendary Resistance"), null);
});

test("the clause is recognised however the author cased it", () => {
  assert.equal(withoutLairUses("Legendary Resistance (3/Day, or 4/day in lair)"), "Legendary Resistance (3/Day)");
});

test("a trait born to a creature that already has a lair says so from the start", () => {
  const html = legendaryResistanceHtml(vampire({ hasLair: true, ruleset: "5.5e" }), { inLair: true });
  assert.match(html, /Legendary Resistance \(3\/Day, or 4\/Day in Lair\)\./);
});

test("and one born without a lair keeps the plain count", () => {
  const html = legendaryResistanceHtml(vampire(), { inLair: false });
  assert.match(html, /Legendary Resistance \(3\/Day\)\./);
  assert.doesNotMatch(html, /in Lair/);
});

test("the trait names the creature, in either ruleset", () => {
  for (const ruleset of ["5e", "5.5e"] as const) {
    const html = legendaryResistanceHtml({ ...vampire(), ruleset });
    assert.match(html, /Dread Vampire/);
    assert.match(html, /can choose to succeed instead/);
  }
});

test("a nameless creature is still described, rather than left with a hole", () => {
  const html = legendaryResistanceHtml({ ...vampire(), name: "" });
  assert.match(html, /If the creature fails a saving throw/);
});

test("finding the trait reports where it is, so removing it takes the right one", () => {
  const MISTY = `<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>`;
  const RESIST = `<p><em><strong>Legendary Resistance (3/Day).</strong></em> It succeeds.</p>`;
  const found = findLegendaryResistance(vampire({ descriptionHtml: { traits: MISTY + RESIST } }));
  assert.equal(found?.index, 1);
  assert.equal(findLegendaryResistance(vampire({ descriptionHtml: { traits: MISTY } })), null);
});

test("the trait is found by its name, whatever the author put in the brackets", () => {
  const withClause = `<p><em><strong>Legendary Resistance (3/Day, or 4/Day in Lair).</strong></em> It succeeds.</p>`;
  const found = findLegendaryResistance(vampire({ descriptionHtml: { traits: withClause } }));
  assert.equal(found?.name, "Legendary Resistance (3/Day, or 4/Day in Lair)");
});
