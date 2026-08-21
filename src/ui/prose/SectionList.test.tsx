/**
 * Editing a section an entry at a time.
 *
 * The rule these all circle is that D&D Beyond's storage never learns about
 * any of it: whatever the author does to a row, what reaches the adapter is the
 * whole section as one HTML string, in order.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type SectionKey } from "../../statblock/model.js";
import { fireEvent } from "../../test-support/render.js";
import { renderBlock } from "../../test-support/editor.js";

/**
 * Lexical commits a dispatched command a microtask later, so anything that
 * inspects the editor's own state — the toolbar's lit buttons, above all — has
 * to let that land first.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Clicking away, as the DOM actually delivers it. */
const clickAway = (root: ShadowRoot) => (root.activeElement as HTMLElement | null)?.blur();

const MISTY = "<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>";
const TAIL = "<p>While it has 0 Hit Points it can't return.</p>";
const CLIMB = "<p><em><strong>Spider Climb.</strong></em> It climbs.</p>";

const creature = (traits?: string): Monster => ({
  ...emptyMonster(),
  ruleset: "5.5e",
  ...(traits === undefined ? {} : { descriptionHtml: { traits } }),
});

/** A stub that records every section write-back, in order. */
function recorder(monster: Monster) {
  const wrote: Array<[string, string]> = [];
  return {
    wrote,
    adapter: {
      setDescription(section: SectionKey, html: string) {
        wrote.push([section, html]);
        monster.descriptionHtml = { ...monster.descriptionHtml, [section]: html };
      },
    },
  };
}

const entries = (root: ShadowRoot) => [
  ...root.querySelectorAll<HTMLElement>('[data-section="traits"] .sb-item'),
];
const addButton = (root: ShadowRoot) =>
  root.querySelector<HTMLElement>('[data-section="traits"] .sb-add-item');

test("a section's entries each get their own editor", (t) => {
  const { root } = renderBlock(t, creature(MISTY + TAIL + CLIMB));
  assert.equal(entries(root).length, 2);
});

test('"Add trait" appends an empty entry without writing anything yet', (t) => {
  // Nothing has been typed, so there is nothing to tell D&D Beyond. Revealing a
  // place to write is a view decision, exactly as revealing a section is.
  const monster = creature(MISTY);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  fireEvent.click(addButton(root)!);

  assert.equal(entries(root).length, 2);
  assert.deepEqual(wrote, []);
});

test("the added entry takes the caret, with bold and italic already on", async (t) => {
  // Every trait on a D&D Beyond block opens with its name in bold italic, and
  // an author who just asked for a new one is about to type exactly that. The
  // lit buttons are the only thing saying so before there is any text to see.
  const { root } = renderBlock(t, creature(MISTY));

  fireEvent.click(addButton(root)!);
  await settle();

  const added = entries(root)[1]!;
  const box = added.querySelector<HTMLElement>('[contenteditable="true"]')!;
  // Compared as a boolean on purpose: asserting two DOM nodes equal makes the
  // runner try to diff the whole document, and it dies building the message.
  assert.ok(root.activeElement === box, "the caret is in the new entry");
  for (const label of ["Bold", "Italic"]) {
    const button = added.querySelector(`[aria-label="${label}"]`);
    assert.equal(button?.getAttribute("aria-pressed"), "true", `${label} is lit`);
  }
});

test("an entry blurred while empty is taken off the section", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  // The author added a row, thought better of it, and clicked away.
  fireEvent.click(addButton(root)!);
  assert.equal(entries(root).length, 3);
  clickAway(root);

  assert.equal(entries(root).length, 2);
  assert.deepEqual(wrote, [["traits", MISTY + CLIMB]], "and the section is unchanged");
});

test("the last entry survives being emptied", (t) => {
  // An author who clears a section's only trait is usually about to retype it.
  // Reaping the row would pull the editor out from under their caret — the same
  // mistake `revealedSections` exists to avoid one level up.
  const { root } = renderBlock(t, creature(), { revealedSections: ["traits"] });

  assert.equal(entries(root).length, 1);
  entries(root)[0]!.querySelector<HTMLElement>('[contenteditable="true"]')!.focus();
  clickAway(root);
  assert.equal(entries(root).length, 1);
});

test("focus moving within an entry does not reap it", (t) => {
  // Clicking the entry's own trash or a toolbar button is still being in it —
  // and the toolbar's buttons refuse focus precisely so this stays true.
  const { root } = renderBlock(t, creature(MISTY));

  fireEvent.click(addButton(root)!);
  const added = entries(root)[1]!;
  added.querySelector<HTMLElement>('[contenteditable="true"]')!.dispatchEvent(
    new FocusEvent("focusout", {
      bubbles: true,
      relatedTarget: added.querySelector('[aria-label="Bold"]'),
    }),
  );

  assert.equal(entries(root).length, 2);
});

test("an entry's trash removes it and writes the rest back in order", (t) => {
  const monster = creature(MISTY + TAIL + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  const trash = entries(root)[0]!.querySelector<HTMLElement>('[aria-label="Remove this trait"]');
  assert.ok(trash, "an entry with neighbours can be removed");
  fireEvent.click(trash!);
  // It has text, so it asks first rather than taking it off the server outright.
  fireEvent.click(entries(root)[0]!.querySelector<HTMLElement>(".sb-remove-confirm")!);

  assert.deepEqual(wrote, [["traits", CLIMB]]);
});

test("a lone entry has no trash — that would be removing the section", (t) => {
  // And the section's own trash is right there in the heading beside it.
  const { root } = renderBlock(t, creature(MISTY));

  assert.equal(entries(root)[0]!.querySelector('[aria-label="Remove this trait"]'), null);
  assert.ok(root.querySelector('[aria-label="Remove Traits"]'), "the section still has one");
});

test("each section names its own entries", (t) => {
  const { root } = renderBlock(t, creature(), {
    revealedSections: ["bonusActions", "legendary"],
  });

  const labels = [...root.querySelectorAll(".sb-add-item")].map((b) => b.textContent);
  assert.ok(labels.includes("Add bonus action"), labels.join(" | "));
  assert.ok(labels.includes("Add legendary action"), labels.join(" | "));
});

test("only the first entry carries the section's placeholder", (t) => {
  // On all six it would be six identical lines of grey italic.
  const { root } = renderBlock(t, creature(), { revealedSections: ["traits"] });

  fireEvent.click(addButton(root)!);
  const prompts = entries(root).map((e) =>
    e.querySelector<HTMLElement>(".sb-prose")!.dataset.placeholder,
  );
  assert.ok(prompts[0], "the first says what belongs in the section");
  assert.equal(prompts[1], undefined);
});
