/**
 * Taking an entry off a compared creature, at the state layer.
 *
 * The panel that produces `detailsHtml` is tested against a real page capture
 * next door; these are about what gets *written* — that the entry lands in the
 * right section in the editor's own markup, that a gated section is opened on
 * the way past, and that the whole thing is one thing to undo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type SectionKey } from "../statblock/model.js";
import { recordingPage as page, type Write } from "../test-support/recording-page.js";
import { joinItems, splitItems } from "../ui/prose/section-items.js";
import { importEntry, sectionHasEntry } from "./import-entry.js";
import { entrySpotlightKey } from "./session.js";

const written = (wrote: Write[], key: string) =>
  wrote.filter(([k]) => k === key).map(([, value]) => value);

const creature = (descriptionHtml: Partial<Record<SectionKey, string>> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  descriptionHtml,
});

const MULTI = `<p><em><strong>Multiattack.</strong></em> It attacks twice.</p>`;
/** As D&D Beyond's monster page renders it: a roll and a reference, both live. */
const BITE = `<p><em><strong>Bite.</strong></em> <span data-dicenotation="1d20+9" data-rolltype="to hit" data-rollaction="Bite">+9</span> to hit, and the target is <a class="tooltip-hover condition-tooltip" href="/x" data-tooltip-href="/conditions/6-tooltip">grappled</a>.</p>`;

test("an imported entry lands at the end of the section it was printed under", async (t) => {
  const { store, wrote } = page(creature({ actions: MULTI }));
  t.after(() => store.stop());

  await importEntry(store, "actions", BITE);

  const [actions] = written(wrote, "actions") as string[];
  const items = splitItems(actions);
  assert.equal(items.length, 2, "the one it had, then the one it was given");
  assert.equal(items[0], MULTI, "and the author's own is untouched");
  assert.match(items[1]!, /^<p><em><strong>Bite\.<\/strong><\/em>/);
});

test("what arrives is the editor's markup, not the page's", async (t) => {
  const { store, wrote } = page(creature());
  t.after(() => store.stop());

  await importEntry(store, "actions", BITE);

  const [actions] = written(wrote, "actions") as string[];
  assert.match(actions, /<span class="roll" data-roll="[^"]*1d20\+9/);
  assert.match(actions, /<span class="ref" data-ref="condition">grappled<\/span>/);
  assert.ok(!actions.includes("data-tooltip-href"), "nothing of the page's own left");
});

test("the section still partitions back to itself", async (t) => {
  const { store, wrote } = page(creature({ traits: MULTI }));
  t.after(() => store.stop());

  await importEntry(store, "traits", BITE);

  const [traits] = written(wrote, "traits") as string[];
  assert.equal(joinItems(splitItems(traits)), traits);
});

test("a section D&D Beyond gates is opened on the way past", async (t) => {
  const { store, wrote } = page(creature());
  t.after(() => store.stop());

  await importEntry(store, "legendary", MULTI);

  assert.deepEqual(written(wrote, "isLegendary"), [true]);
  assert.equal(written(wrote, "legendary").length, 1, "and the prose goes in behind it");
  assert.deepEqual(
    wrote.map(([key]) => key),
    ["isLegendary", "legendary"],
    "the checkbox first, or the write would be dropped",
  );
});

test("lair and mythic are the same gate, and an open one is left alone", async (t) => {
  const lair = page(creature());
  t.after(() => lair.store.stop());
  await importEntry(lair.store, "lair", MULTI);
  assert.deepEqual(written(lair.wrote, "hasLair"), [true]);

  const mythic = page(creature());
  t.after(() => mythic.store.stop());
  await importEntry(mythic.store, "mythic", MULTI);
  assert.deepEqual(written(mythic.wrote, "isMythic"), [true]);

  const already = page({ ...creature(), isLegendary: true });
  t.after(() => already.store.stop());
  await importEntry(already.store, "legendary", MULTI);
  assert.deepEqual(written(already.wrote, "isLegendary"), [], "nothing to tick");
});

test("gate and prose are one thing to undo", async (t) => {
  const { store, wrote } = page(creature());
  t.after(() => store.stop());

  await importEntry(store, "legendary", MULTI);
  wrote.length = 0;
  await store.commands.undo();

  assert.deepEqual(written(wrote, "isLegendary"), [false], "one undo puts the tick back too");
});

test("the arriving entry is the one the block lights up", async (t) => {
  const { store } = page(creature());
  t.after(() => store.stop());

  await importEntry(store, "actions", BITE);

  assert.equal(store.getSession().pendingSpotlight, entrySpotlightKey("actions", "Bite"));
});

test("an entry with nothing in it is not an import", async (t) => {
  const { store, wrote } = page(creature());
  t.after(() => store.stop());

  await importEntry(store, "actions", "<div>   </div>");

  assert.deepEqual(wrote, [], "nothing written, nothing to undo");
});

test("a name the creature already carries is recognised, by name and not by case", () => {
  const monster = creature({ actions: MULTI });
  assert.equal(sectionHasEntry(monster, "actions", "Multiattack"), true);
  assert.equal(sectionHasEntry(monster, "actions", "multiattack"), true);
  assert.equal(sectionHasEntry(monster, "actions", "Bite"), false);
  assert.equal(sectionHasEntry(monster, "traits", "Multiattack"), false, "the wrong section");
  assert.equal(sectionHasEntry(monster, "actions", ""), false, "an unnamed preamble names nothing");
});
