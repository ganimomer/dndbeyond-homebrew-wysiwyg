/**
 * The castle, and what it costs to take off.
 *
 * The same shape as the crown's suite, with one extra worry of its own: the
 * lair's removal edits the Legendary Resistance trait, which belongs to a
 * different feature entirely, so cancelling has to leave that trait alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type SectionKey } from "../../statblock/model.js";
import { fireEvent } from "../../test-support/render.js";
import { renderBlock } from "../../test-support/editor.js";

/** The command stack applies a batch across microtasks; let it land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const MISTY = "<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>";
const RESIST = "<p><em><strong>Legendary Resistance (3/Day).</strong></em> It succeeds.</p>";
const IN_LAIR =
  "<p><em><strong>Legendary Resistance (3/Day, or 4/Day in Lair).</strong></em> It succeeds.</p>";

const creature = (over: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  ruleset: "5.5e",
  hasLair: true,
  ...over,
});

/** Records every write the block makes, description or checkbox. */
function recorder() {
  const wrote: Array<[string, unknown]> = [];
  return {
    wrote,
    adapter: {
      setDescription: (section: SectionKey, html: string) => wrote.push([section, html]),
      setLegendary: (on: boolean) => wrote.push(["isLegendary", on]),
      setHasLair: (on: boolean) => wrote.push(["hasLair", on]),
    },
  };
}

const chip = (root: ShadowRoot) => root.querySelector<HTMLElement>('[data-status="lair"]');
const removeButton = (root: ShadowRoot) =>
  chip(root)!.querySelector<HTMLElement>(".sb-chip-remove")!;
const dialog = (root: ShadowRoot) => root.querySelector<HTMLElement>(".sb-dialog");

test("a creature with no lair wears no castle", (t) => {
  const { root } = renderBlock(t, creature({ hasLair: false }));
  assert.equal(chip(root), null);
});

test("a creature with one wears it, in the meta row", (t) => {
  const { root } = renderBlock(t, creature());

  assert.match(chip(root)!.textContent!, /Lair/);
  assert.ok(chip(root)!.querySelector("svg"), "with the castle drawn on it");
  assert.ok(root.querySelector(".meta")!.contains(chip(root)!));
});

test("the castle is worn even by a creature with no size, type or alignment", (t) => {
  const { root } = renderBlock(t, creature({ size: "", type: "", alignment: "", subTypes: [] }));
  assert.ok(chip(root));
});

test("a legendary creature with a lair wears both, side by side", (t) => {
  const { root } = renderBlock(t, creature({ isLegendary: true }));

  const chips = [...root.querySelectorAll<HTMLElement>(".status-chip")];
  assert.deepEqual(
    chips.map((c) => c.dataset.status),
    ["legendary", "lair"],
  );
});

test("with nothing to lose, the castle comes off on one click", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: MISTY } }), { adapter });

  fireEvent.click(removeButton(root));
  await settle();

  assert.equal(dialog(root), null, "no ceremony over nothing");
  assert.deepEqual(wrote, [["hasLair", false]]);
});

test("a plain Legendary Resistance is nothing to lose either", async (t) => {
  // There are no in-lair uses in it to take away.
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: RESIST } }), { adapter });

  fireEvent.click(removeButton(root));
  await settle();

  assert.equal(dialog(root), null);
  assert.deepEqual(wrote, [["hasLair", false]]);
});

test("in-lair uses are worth asking about, and nothing is written yet", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: IN_LAIR } }), { adapter });

  fireEvent.click(removeButton(root));
  await settle();

  assert.match(dialog(root)!.textContent!, /in-lair uses from Legendary Resistance/);
  assert.deepEqual(wrote, []);
});

test("so is lair action text", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { lair: "<p>It stirs.</p>" } }), {
    adapter,
  });

  fireEvent.click(removeButton(root));
  await settle();

  assert.match(dialog(root)!.textContent!, /Lair Actions section/);
  assert.deepEqual(wrote, []);
});

test("cancelling leaves the creature — and its trait — exactly as they were", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: IN_LAIR } }), { adapter });

  fireEvent.click(removeButton(root));
  fireEvent.click(dialog(root)!.querySelector<HTMLElement>(".sb-dialog-cancel")!);
  await settle();

  assert.equal(dialog(root), null);
  assert.deepEqual(wrote, []);
  assert.ok(chip(root), "and still has its lair");
});

test("confirming takes the in-lair uses, the section and the tick", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(
    t,
    creature({ descriptionHtml: { traits: IN_LAIR, lair: "<p>It stirs.</p>" } }),
    { adapter },
  );

  fireEvent.click(removeButton(root));
  fireEvent.click(dialog(root)!.querySelector<HTMLElement>(".sb-dialog-confirm")!);
  await settle();

  assert.deepEqual(wrote, [
    ["traits", RESIST],
    ["lair", ""],
    ["hasLair", false],
  ]);
});

test("Escape is a way out of the dialog, like everything else here", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: IN_LAIR } }), { adapter });

  fireEvent.click(removeButton(root));
  fireEvent.keyDown(window, { key: "Escape" });
  await settle();

  assert.equal(dialog(root), null);
  assert.deepEqual(wrote, []);
});

// --- the way in -------------------------------------------------------------

const kebab = (root: ShadowRoot) => root.querySelector<HTMLElement>(".name-menu .cm-trigger")!;
const menuItems = (root: ShadowRoot) =>
  [...root.querySelectorAll<HTMLElement>(".name-menu .cm-item")].map((i) => i.textContent!.trim());
const menuItem = (root: ShadowRoot, label: string) =>
  [...root.querySelectorAll<HTMLElement>(".name-menu .cm-item")].find(
    (i) => i.textContent!.trim() === label,
  )!;

test('"Add lair" is offered to a creature without one, and withdrawn once it has', (t) => {
  const { root } = renderBlock(t, creature({ hasLair: false }));
  fireEvent.click(kebab(root));
  assert.ok(menuItems(root).includes("Add lair"), menuItems(root).join(" | "));

  const second = renderBlock(t, creature());
  fireEvent.click(kebab(second.root));
  assert.equal(menuItems(second.root).includes("Add lair"), false);
});

test("adding a lair ticks the box and grants the extra resistance", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(
    t,
    creature({ hasLair: false, descriptionHtml: { traits: MISTY + RESIST } }),
    { adapter },
  );

  fireEvent.click(kebab(root));
  fireEvent.click(menuItem(root, "Add lair"));
  await settle();

  assert.deepEqual(
    wrote.map(([key]) => key),
    ["traits", "hasLair"],
  );
  assert.match(String(wrote[0]![1]), /Legendary Resistance \(3\/Day, or 4\/Day in Lair\)/);
  assert.equal(wrote[1]![1], true);
});

test("and opens Lair Actions with somewhere to type", async (t) => {
  const { adapter } = recorder();
  const { root, store, repaint } = renderBlock(t, creature({ hasLair: false }), { adapter });

  fireEvent.click(kebab(root));
  fireEvent.click(menuItem(root, "Add lair"));
  repaint();

  assert.ok(store.getSession().revealedSections.has("lair"));
  assert.ok(root.querySelector('[data-section="lair"] .sb-item'), "with an entry to write in");
});

test("a creature with a lair has no trash on its Lair Actions section", (t) => {
  const { root } = renderBlock(t, creature({ descriptionHtml: { lair: "<p>It stirs.</p>" } }));

  assert.equal(
    root
      .querySelector('[data-section="lair"]')!
      .closest(".description-block")!
      .querySelector(".sb-remove-section"),
    null,
  );
});
