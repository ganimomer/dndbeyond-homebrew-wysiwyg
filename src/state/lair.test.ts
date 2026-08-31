/**
 * The two gestures — castle on, castle off — and the one thing a lair does to
 * prose that isn't its own.
 *
 * A creature's lair reaches into its Legendary Resistance, because the 2024
 * books grant an extra use at home. That makes these tests as much about
 * restraint as about action: the amendment happens only in 2024, only when
 * there is a trait, and it comes back out again when the lair does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type SectionKey } from "../statblock/model.js";
import { recordingPage as page, type Write } from "../test-support/recording-page.js";
import { addLair, lairCasualties, removeLair } from "./lair.js";
import { entrySpotlightKey, sectionFocusKey } from "./session.js";

const written = (wrote: Write[], key: string) =>
  wrote.filter(([k]) => k === key).map(([, value]) => value);

const MISTY = `<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>`;
const RESIST = `<p><em><strong>Legendary Resistance (3/Day).</strong></em> It succeeds instead.</p>`;
const IN_LAIR = `<p><em><strong>Legendary Resistance (3/Day, or 4/Day in Lair).</strong></em> It succeeds instead.</p>`;

const vampire = (
  descriptionHtml: Partial<Record<SectionKey, string>> = {},
  over: Partial<Monster> = {},
): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  ruleset: "5.5e",
  descriptionHtml,
  ...over,
});

test("a lair grants a 2024 creature an extra Legendary Resistance at home", async (t) => {
  const { store, wrote, written: got } = page(vampire({ traits: MISTY + RESIST }));
  t.after(() => store.stop());

  await addLair(store);

  const [traits] = got("traits") as string[];
  assert.match(traits!, /Legendary Resistance \(3\/Day, or 4\/Day in Lair\)/);
  assert.match(traits!, /Misty Escape/, "and leaves the rest of the traits alone");
  assert.equal(written(wrote, "hasLair").length, 1);
});

test("a 2014 creature's trait is left alone — the in-lair grant is a 2024 rule", async (t) => {
  const { store, written: got } = page(vampire({ traits: RESIST }, { ruleset: "5e" }));
  t.after(() => store.stop());

  await addLair(store);

  assert.deepEqual(got("traits"), []);
  assert.deepEqual(got("hasLair"), [true]);
});

test("a creature with no Legendary Resistance has nothing to amend", async (t) => {
  const { store, wrote } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await addLair(store);

  assert.deepEqual(wrote, [["hasLair", true]]);
});

test("a trait that already says so is not amended twice", async (t) => {
  const { store, written: got } = page(vampire({ traits: IN_LAIR }));
  t.after(() => store.stop());

  await addLair(store);

  assert.deepEqual(got("traits"), []);
});

test("either way, the Lair Actions section opens with the caret in it", async (t) => {
  for (const traits of [MISTY, MISTY + RESIST, IN_LAIR]) {
    const { store } = page(vampire({ traits }));
    t.after(() => store.stop());

    await addLair(store);

    assert.ok(store.getSession().revealedSections.has("lair"));
    assert.equal(store.getSession().pendingFocus, sectionFocusKey("lair"));
  }
});

test("the amended trait is pointed at by the name it ends up with", async (t) => {
  // Not the name it had: `SectionList` resolves a spotlight by name, and by the
  // time it looks, the entry is called the new thing.
  const { store } = page(vampire({ traits: MISTY + RESIST }));
  t.after(() => store.stop());

  await addLair(store);

  assert.equal(
    store.getSession().pendingSpotlight,
    entrySpotlightKey("traits", "Legendary Resistance (3/Day, or 4/Day in Lair)"),
  );
});

test("a trait that needed no amending is pointed at all the same", async (t) => {
  // "Ensure and highlight": the author still wants to see what it says.
  const { store } = page(vampire({ traits: IN_LAIR }));
  t.after(() => store.stop());

  await addLair(store);

  assert.equal(
    store.getSession().pendingSpotlight,
    entrySpotlightKey("traits", "Legendary Resistance (3/Day, or 4/Day in Lair)"),
  );
});

test("a creature with no trait points at nothing", async (t) => {
  const { store } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await addLair(store);

  assert.equal(store.getSession().pendingSpotlight, null);
});

test("adding a lair is one thing to undo", async (t) => {
  const { store } = page(vampire({ traits: RESIST }));
  t.after(() => store.stop());

  await addLair(store);
  assert.equal(store.commands.undoLabel, "Add lair");

  await store.commands.undo();
  assert.equal(store.commands.canUndo, false);
});

test("removing the lair takes the clause, the section and the tick, in one step", async (t) => {
  const { store, written: got } = page(vampire({ traits: IN_LAIR, lair: "<p>It stirs.</p>" }));
  t.after(() => store.stop());
  store.update({ revealedSections: new Set(["lair"] as const) });

  await removeLair(store);

  assert.deepEqual(got("traits"), [RESIST]);
  assert.deepEqual(got("lair"), [""]);
  assert.deepEqual(got("hasLair"), [false]);
  assert.equal(store.getSession().revealedSections.has("lair"), false);
  assert.equal(store.commands.undoLabel, "Remove lair");
});

test("removing a lair from a creature with nothing in it writes only the tick", async (t) => {
  const { store, wrote } = page(vampire({ traits: MISTY + RESIST }));
  t.after(() => store.stop());

  await removeLair(store);

  assert.deepEqual(wrote, [["hasLair", false]]);
});

test("nothing to lose: no in-lair clause and an empty section", () => {
  for (const lair of ["", "   ", `<p><br data-mce-bogus="1"></p>`]) {
    assert.deepEqual(lairCasualties(vampire({ traits: MISTY + RESIST, lair })), {
      resistance: false,
      actions: false,
    });
  }
});

test("something to lose: the clause and the section count separately", () => {
  assert.deepEqual(lairCasualties(vampire({ traits: IN_LAIR })), {
    resistance: true,
    actions: false,
  });
  assert.deepEqual(lairCasualties(vampire({ traits: MISTY, lair: "<p>It stirs.</p>" })), {
    resistance: false,
    actions: true,
  });
});
