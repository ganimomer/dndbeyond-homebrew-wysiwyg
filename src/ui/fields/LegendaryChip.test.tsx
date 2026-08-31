/**
 * The crown, and what it costs to take off.
 *
 * The chip is the only place legendary status lives on the block, so these are
 * as much about the confirm as about the chip: removing it clears a trait and a
 * whole section, and the one thing that must never happen is that going through
 * the dialog and cancelling still wrote something.
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

const creature = (over: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  isLegendary: true,
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
    },
  };
}

const chip = (root: ShadowRoot) => root.querySelector<HTMLElement>('[data-status="legendary"]');
const removeButton = (root: ShadowRoot) =>
  chip(root)!.querySelector<HTMLElement>(".sb-chip-remove")!;
const dialog = (root: ShadowRoot) => root.querySelector<HTMLElement>(".sb-dialog");

test("a creature that isn't legendary wears no crown", (t) => {
  const { root } = renderBlock(t, creature({ isLegendary: false }));
  assert.equal(chip(root), null);
});

test("a legendary creature wears one, in the meta row", (t) => {
  const { root } = renderBlock(t, creature());

  assert.match(chip(root)!.textContent!, /Legendary/);
  assert.ok(chip(root)!.querySelector("svg"), "with the crown drawn on it");
  assert.ok(root.querySelector(".meta")!.contains(chip(root)!));
});

test("the crown is worn even by a creature with no size, type or alignment", (t) => {
  // The meta row isn't printed at all for such a creature today. It has to be
  // now, or the chip has nowhere to hang.
  const { root } = renderBlock(t, creature({ size: "", type: "", alignment: "", subTypes: [] }));
  assert.ok(chip(root));
});

test("with nothing to lose, the crown comes off on one click", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: MISTY } }), { adapter });

  fireEvent.click(removeButton(root));
  await settle();

  assert.equal(dialog(root), null, "no ceremony over nothing");
  assert.deepEqual(wrote, [["isLegendary", false]]);
});

test("with a Legendary Resistance trait, it asks first and writes nothing yet", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: MISTY + RESIST } }), {
    adapter,
  });

  fireEvent.click(removeButton(root));
  await settle();

  assert.ok(dialog(root));
  assert.match(dialog(root)!.textContent!, /Legendary Resistance/);
  assert.deepEqual(wrote, []);
});

test("legendary actions with text in them are worth asking about too", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { legendary: "<p>It moves.</p>" } }), {
    adapter,
  });

  fireEvent.click(removeButton(root));
  await settle();

  assert.match(dialog(root)!.textContent!, /Legendary Actions/);
  assert.deepEqual(wrote, []);
});

test("cancelling leaves the creature exactly as it was", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: RESIST } }), { adapter });

  fireEvent.click(removeButton(root));
  fireEvent.click(dialog(root)!.querySelector<HTMLElement>(".sb-dialog-cancel")!);
  await settle();

  assert.equal(dialog(root), null);
  assert.deepEqual(wrote, []);
  assert.ok(chip(root), "and still legendary");
});

test("confirming takes the trait, the section and the tick", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(
    t,
    creature({ descriptionHtml: { traits: MISTY + RESIST, legendary: "<p>It moves.</p>" } }),
    { adapter },
  );

  fireEvent.click(removeButton(root));
  fireEvent.click(dialog(root)!.querySelector<HTMLElement>(".sb-dialog-confirm")!);
  await settle();

  assert.deepEqual(wrote, [
    ["traits", MISTY],
    ["legendary", ""],
    ["isLegendary", false],
  ]);
});

test("Escape is a way out of the dialog, like everything else here", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: RESIST } }), { adapter });

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

test('"Make legendary" is offered to a creature that isn\'t', (t) => {
  const { root } = renderBlock(t, creature({ isLegendary: false }));

  fireEvent.click(kebab(root));
  assert.ok(menuItems(root).includes("Make legendary"), menuItems(root).join(" | "));
});

test("and withdrawn once it is — the chip is where status lives from then on", (t) => {
  const { root } = renderBlock(t, creature());

  fireEvent.click(kebab(root));
  assert.equal(menuItems(root).includes("Make legendary"), false);
});

test("making a creature legendary ticks the box and gives it the trait", async (t) => {
  const { wrote, adapter } = recorder();
  const { root } = renderBlock(
    t,
    creature({ isLegendary: false, descriptionHtml: { traits: MISTY } }),
    { adapter },
  );

  fireEvent.click(kebab(root));
  fireEvent.click(menuItem(root, "Make legendary"));
  await settle();

  assert.deepEqual(
    wrote.map(([key]) => key),
    ["traits", "isLegendary"],
  );
  assert.match(String(wrote[0]![1]), /Legendary Resistance \(3\/Day\)/);
  assert.equal(wrote[1]![1], true);
});

test("and opens Legendary Actions with somewhere to type", async (t) => {
  const { adapter } = recorder();
  const { root, store, repaint } = renderBlock(
    t,
    creature({ isLegendary: false, descriptionHtml: { traits: MISTY } }),
    { adapter },
  );

  fireEvent.click(kebab(root));
  fireEvent.click(menuItem(root, "Make legendary"));
  repaint();

  assert.ok(store.getSession().revealedSections.has("legendary"));
  assert.ok(
    root.querySelector('[data-section="legendary"] .sb-item'),
    "with an entry to write in",
  );
});

test("a legendary creature's Legendary Actions section has no trash of its own", (t) => {
  const { root } = renderBlock(t, creature({ descriptionHtml: { legendary: "<p>It moves.</p>" } }));

  assert.equal(
    root.querySelector('[data-section="legendary"]')!
      .closest(".description-block")!
      .querySelector(".sb-remove-section"),
    null,
  );
});

test("a legendary creature that has written nothing yet still gets an editor", async (t) => {
  // Straight off the form, with the box ticked and the textarea empty: nothing
  // was revealed this session, so the section has to come from the crown alone
  // — and as something to type in, not as an empty read-only heading.
  const { adapter } = recorder();
  const { root } = renderBlock(t, creature({ descriptionHtml: { traits: MISTY } }), { adapter });

  const section = root.querySelector('[data-section="legendary"]');
  assert.ok(section, "the section is on the block");
  assert.ok(section!.querySelector(".sb-item"), "with an entry to write in");
});
