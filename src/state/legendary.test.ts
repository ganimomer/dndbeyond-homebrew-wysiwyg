import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type SectionKey } from "../statblock/model.js";
import { recordingPage as page, type Write } from "../test-support/recording-page.js";
import { joinItems, splitItems } from "../ui/prose/section-items.js";
import {
  legendaryCasualties,
  legendaryHasContent,
  makeLegendary,
  removeLegendary,
} from "./legendary.js";
import { entrySpotlightKey, sectionFocusKey } from "./session.js";

const written = (wrote: Write[], key: string) =>
  wrote.filter(([k]) => k === key).map(([, value]) => value);

/**
 * These are the two gestures — crown on, crown off — and what an author would
 * otherwise have done by hand around each of them. The assertions that matter
 * most are the ones about *not* acting: never a second Legendary Resistance,
 * never a write for a section that had nothing in it.
 */

const MISTY = `<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>`;
const RESIST = `<p><em><strong>Legendary Resistance (3/Day, or 4/Day in Lair).</strong></em> It succeeds instead.</p>`;

const vampire = (descriptionHtml: Partial<Record<SectionKey, string>> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  descriptionHtml,
});


test("making a creature legendary gives it a Legendary Resistance trait, at the top", async (t) => {
  const { store, wrote } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await makeLegendary(store);

  const [traits] = written(wrote, "traits") as string[];
  const items = splitItems(traits!);
  assert.equal(items.length, 2);
  assert.match(items[0]!, /Legendary Resistance \(3\/Day\)/);
  assert.equal(items[1], MISTY);
});

test("the added trait is one entry, and the section still partitions back to itself", async (t) => {
  // The whole prose layer rests on `joinItems(splitItems(h)) === h`. An entry we
  // hand-write has to survive that as well as one D&D Beyond wrote.
  const { store, wrote } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await makeLegendary(store);

  const [traits] = written(wrote, "traits") as string[];
  assert.equal(joinItems(splitItems(traits!)), traits);
});

test("a creature with no traits at all gets the trait as its only one", async (t) => {
  const { store, wrote } = page(vampire());
  t.after(() => store.stop());

  await makeLegendary(store);

  const [traits] = written(wrote, "traits") as string[];
  assert.deepEqual(splitItems(traits!).length, 1);
});

test("a creature that already resists legendarily is not given a second one", async (t) => {
  const { store, wrote } = page(vampire({ traits: MISTY + RESIST }));
  t.after(() => store.stop());

  await makeLegendary(store);

  assert.deepEqual(written(wrote, "traits"), []);
});

test("the existing trait is the one pointed at, wherever in the list it sits", async (t) => {
  const { store } = page(vampire({ traits: MISTY + RESIST }));
  t.after(() => store.stop());

  await makeLegendary(store);

  assert.equal(
    store.getSession().pendingSpotlight,
    entrySpotlightKey("traits", "Legendary Resistance (3/Day, or 4/Day in Lair)"),
  );
});

test("an added trait is pointed at by the name it was given", async (t) => {
  const { store } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await makeLegendary(store);

  assert.equal(
    store.getSession().pendingSpotlight,
    entrySpotlightKey("traits", "Legendary Resistance (3/Day)"),
  );
});

test("either way, the checkbox is ticked and Legendary Actions opens with the caret in it", async (t) => {
  for (const traits of [MISTY, MISTY + RESIST]) {
    const { store, wrote } = page(vampire({ traits }));
    t.after(() => store.stop());

    await makeLegendary(store);

    assert.deepEqual(written(wrote, "isLegendary"), [true]);
    assert.ok(store.getSession().revealedSections.has("legendary"));
    assert.equal(store.getSession().pendingFocus, sectionFocusKey("legendary"));
  }
});

test("making a creature legendary is one thing to undo, not three", async (t) => {
  const { store } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await makeLegendary(store);
  assert.equal(store.commands.undoLabel, "Make legendary");

  await store.commands.undo();
  assert.equal(store.commands.canUndo, false);
});

test("nothing to lose: an empty Legendary Actions section and no trait", () => {
  for (const legendary of ["", "   ", `<p><br data-mce-bogus="1"></p>`, "<p>\n</p>"]) {
    assert.equal(legendaryHasContent(vampire({ traits: MISTY, legendary })), false, legendary);
  }
});

test("something to lose: either the trait or text in the section is enough", () => {
  assert.equal(legendaryHasContent(vampire({ traits: MISTY + RESIST })), true);
  assert.equal(legendaryHasContent(vampire({ legendary: "<p>It moves.</p>" })), true);
  assert.deepEqual(legendaryCasualties(vampire({ traits: MISTY + RESIST })), {
    resistance: true,
    actions: false,
  });
  assert.deepEqual(legendaryCasualties(vampire({ legendary: "<p>It moves.</p>" })), {
    resistance: false,
    actions: true,
  });
});

test("removing legendary takes the trait, the section and the tick, in one step", async (t) => {
  const { store, wrote } = page(
    vampire({ traits: MISTY + RESIST, legendary: "<p>It moves.</p>" }),
  );
  t.after(() => store.stop());
  store.update({ revealedSections: new Set(["legendary"] as const) });

  await removeLegendary(store);

  assert.deepEqual(written(wrote, "traits"), [MISTY]);
  assert.deepEqual(written(wrote, "legendary"), [""]);
  assert.deepEqual(written(wrote, "isLegendary"), [false]);
  assert.equal(store.getSession().revealedSections.has("legendary"), false);
  assert.equal(store.commands.undoLabel, "Not legendary");
});

test("removing legendary from a creature with nothing in it writes only the tick", async (t) => {
  const { store, wrote } = page(vampire({ traits: MISTY }));
  t.after(() => store.stop());

  await removeLegendary(store);

  assert.deepEqual(wrote, [["isLegendary", false]]);
});

test("a 2024 creature that already has a lair gets a trait that says so", async (t) => {
  // Otherwise the trait would depend on which chip the author reached for
  // first, and only one of the two orders would come out right.
  const { store, wrote } = page({ ...vampire({ traits: MISTY }), ruleset: "5.5e", hasLair: true });
  t.after(() => store.stop());

  await makeLegendary(store);

  const [traits] = written(wrote, "traits") as string[];
  assert.match(traits!, /Legendary Resistance \(3\/Day, or 4\/Day in Lair\)/);
});

test("but a 2014 creature with a lair keeps the plain count", async (t) => {
  // The in-lair grant is a 2024 rule; the 2014 books don't write it.
  const { store, wrote } = page({ ...vampire({ traits: MISTY }), ruleset: "5e", hasLair: true });
  t.after(() => store.stop());

  await makeLegendary(store);

  const [traits] = written(wrote, "traits") as string[];
  assert.match(traits!, /Legendary Resistance \(3\/Day\)/);
  assert.doesNotMatch(traits!, /in Lair/);
});
