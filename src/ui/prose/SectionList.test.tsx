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

/** The editable box of an entry — where the caret goes and what Lexical owns. */
const box = (entry: HTMLElement) => entry.querySelector<HTMLElement>('[contenteditable="true"]')!;

/** Enter, as the DOM delivers it to the editor with the caret in it. */
const pressEnter = async (target: HTMLElement) => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
};

test("a blank line ends the entry and opens the next, with the caret in it", async (t) => {
  // Two Enters is how an editor of this shape has always been told an entry is
  // finished, and an author who ends one is about to start the next.
  //
  // The entry is added rather than clicked into because jsdom has no layout and
  // so no way to put a caret anywhere; what the caret then does to the *content*
  // of an item is `editor/prose-split.test.ts`'s subject.
  const monster = creature(MISTY);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });
  fireEvent.click(addButton(root)!);
  await settle();

  const added = box(entries(root)[1]!);
  await pressEnter(added);
  await pressEnter(added);

  assert.equal(entries(root).length, 3);
  assert.ok(root.activeElement === box(entries(root)[2]!), "the caret moved to the new entry");
  assert.deepEqual(wrote, [["traits", MISTY]], "and the section itself is unchanged");
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

const mergeButtons = (root: ShadowRoot) => [
  ...root.querySelectorAll<HTMLElement>('[data-section="traits"] .sb-merge'),
];

test("the gap between two entries offers to merge them, and no other gap does", (t) => {
  // A band above the first entry or below the last joins nothing — it is there
  // to be dropped into, not to be clicked.
  const { root } = renderBlock(t, creature(MISTY + CLIMB));

  assert.equal(entries(root).length, 2);
  assert.equal(mergeButtons(root).length, 1);
  assert.equal(mergeButtons(root)[0]!.getAttribute("aria-label"), "Merge these two traits");
});

test("merging two entries leaves one editor holding both", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  fireEvent.click(mergeButtons(root)[0]!);

  assert.equal(entries(root).length, 1);
  assert.equal(
    box(entries(root)[0]!).textContent,
    "Misty Escape. It becomes mist.Spider Climb. It climbs.",
  );
  // The section is stored as one string and cut at the bold lead-ins, so
  // joining two entries back up produces the very same string. There is
  // nothing to tell D&D Beyond, and no reason to wake the autosave.
  assert.deepEqual(wrote, []);
});

test("a merged entry can be merged again", (t) => {
  const { root } = renderBlock(t, creature(MISTY + CLIMB + "<p><strong>Regeneration.</strong></p>"));
  assert.equal(entries(root).length, 3);

  fireEvent.click(mergeButtons(root)[0]!);
  fireEvent.click(mergeButtons(root)[0]!);

  assert.equal(entries(root).length, 1);
  assert.equal(mergeButtons(root).length, 0, "and there is nothing left to merge it with");
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

/**
 * jsdom has no layout, so the drag is handed one: every entry 20 tall, stacked
 * in order, each section's list wrapped around its own.
 */
function layOut(root: ShadowRoot) {
  const rect = (top: number, bottom: number) =>
    ({ top, bottom, height: bottom - top, left: 0, right: 100, width: 100, x: 0, y: top,
       toJSON: () => ({}) }) as DOMRect;
  let y = 0;
  for (const list of root.querySelectorAll<HTMLElement>(".sb-section-list")) {
    const top = y;
    for (const item of [...list.children].filter((c) => c.classList.contains("sb-item"))) {
      const box = rect(y, y + 20);
      item.getBoundingClientRect = () => box;
      y += 20;
    }
    const box = rect(top, y);
    list.getBoundingClientRect = () => box;
    y += 10;
  }
}

const handleOf = (entry: HTMLElement) => entry.querySelector<HTMLElement>(".sb-drag-handle")!;

/** A press, a move and a release, as the browser delivers them. */
function dragTo(handle: HTMLElement, y: number) {
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: y }));
}

test("an entry dragged past its neighbour changes places with it", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });
  layOut(root);

  // Entry 0 is 0–20 and entry 1 is 20–40, so 35 is past the second's middle.
  dragTo(handleOf(entries(root)[0]!), 35);

  assert.deepEqual(wrote, [["traits", CLIMB + MISTY]]);
});

test("an entry dropped where it already was leaves the section alone", (t) => {
  // The smallest twitch of the mouse must not rewrite a creature.
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });
  layOut(root);

  dragTo(handleOf(entries(root)[0]!), 8);

  assert.deepEqual(wrote, []);
});

test("a press that never travels is not a drag", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });
  layOut(root);

  const handle = handleOf(entries(root)[0]!);
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1, clientY: 1 }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: 1, clientY: 1 }));

  assert.deepEqual(wrote, [], "a click on the handle is just a click");
});

test("Escape puts the entry back", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });
  layOut(root);

  const handle = handleOf(entries(root)[0]!);
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 35 }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 35 }));

  assert.deepEqual(wrote, []);
});

test("the arrow keys move an entry, and the keyboard goes with it", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  fireEvent.keyDown(handleOf(entries(root)[0]!), { key: "ArrowDown" });

  assert.deepEqual(wrote, [["traits", CLIMB + MISTY]]);
  // The entry moved, so the handle under the author's finger has to move too —
  // otherwise a second press moves a different entry.
  assert.ok(
    root.activeElement === handleOf(entries(root)[1]!),
    "focus followed the entry to its new place",
  );
});

test("an entry at the end of a section stays there", (t) => {
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  fireEvent.keyDown(handleOf(entries(root)[1]!), { key: "ArrowDown" });

  assert.deepEqual(wrote, []);
});

test("Alt and an arrow move an entry to the next section, writing both", (t) => {
  // Which is how an action becomes a bonus action.
  const monster = creature(MISTY + CLIMB);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter, revealedSections: ["bonusActions"] });

  fireEvent.keyDown(handleOf(entries(root)[1]!), { key: "ArrowDown", altKey: true });

  assert.deepEqual(wrote, [
    ["traits", MISTY],
    ["bonusActions", CLIMB],
  ]);
  const bonus = [...root.querySelectorAll('[data-section="bonusActions"] .sb-item')];
  assert.equal(bonus.length, 1, "and it took the place of the empty entry it found there");
});

test("a section emptied by dragging its last entry away stays on the block", (t) => {
  // Vanishing mid-gesture would take the heading the author was aiming at with
  // it — the same reason a revealed section isn't dropped the moment it reads
  // empty.
  const monster = creature(MISTY);
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter, revealedSections: ["bonusActions"] });

  fireEvent.keyDown(handleOf(entries(root)[0]!), { key: "ArrowDown", altKey: true });

  assert.deepEqual(wrote, [
    ["traits", ""],
    ["bonusActions", MISTY],
  ]);
  assert.equal(entries(root).length, 1, "with an empty entry to type into");
  assert.equal(box(entries(root)[0]!).textContent, "");
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
