/**
 * The "Add section" row in the name row's menu: what it offers, and what
 * picking something from it does. Whether a revealed section then *renders* is
 * the block's business — see StatBlock.test.tsx.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type Ruleset } from "../../statblock/model.js";
import { fireEvent } from "../../test-support/render.js";
import { renderBlock } from "../../test-support/editor.js";
import { ADDABLE_SECTIONS, SECTION_LABEL } from "./section-registry.js";

const creature = (ruleset: Ruleset, overrides: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  ruleset,
  ...overrides,
});

/** The sections the row is currently offering, in menu order. Every row is in
 * the DOM whether or not the menu is open — the popover is hidden with CSS —
 * so reading them takes no clicking. */
const offered = (root: ShadowRoot): string[] =>
  [...root.querySelectorAll(".name-menu .cm-submenu .cm-label")].map((n) => n.textContent ?? "");

for (const ruleset of ["5e", "5.5e"] as const) {
  test(`${ruleset} offers every section a blank creature hasn't got`, (t) => {
    const { root } = renderBlock(t, creature(ruleset));

    assert.deepEqual(
      offered(root),
      ADDABLE_SECTIONS.map((key) => SECTION_LABEL[key]),
    );
  });

  test(`${ruleset} drops the row once there is nothing left to add`, (t) => {
    const descriptionHtml = Object.fromEntries(
      ADDABLE_SECTIONS.map((key) => [key, `<p>${key}</p>`]),
    );
    const { root } = renderBlock(t, creature(ruleset, { descriptionHtml }));

    assert.equal(root.querySelector(".name-menu .cm-parent"), null);
  });
}

test("a section D&D Beyond already has text for is not on offer", (t) => {
  const { root } = renderBlock(
    t,
    creature("5.5e", { descriptionHtml: { actions: "<p>Multiattack.</p>" } }),
  );

  assert.ok(!offered(root).includes("Actions"), "already on the block");
  assert.ok(offered(root).includes("Reactions"), "but its neighbours still are");
});

test("D&D Beyond's empty-textarea placeholder does not count as content", (t) => {
  // An unused section comes back as markup that renders blank; it is still a
  // section with nothing in it, and must still be on offer.
  const { root } = renderBlock(
    t,
    creature("5.5e", { descriptionHtml: { actions: '<p><br data-mce-bogus="1"></p>' } }),
  );

  assert.ok(offered(root).includes("Actions"));
});

test("legendary, mythic and lair are not on offer", (t) => {
  // D&D Beyond keeps each behind a checkbox and won't read the textarea back
  // while it's unticked, so prose written here would be lost on the next read.
  const { root } = renderBlock(t, creature("5.5e"));

  for (const label of ["Legendary Actions", "Mythic Actions", "Lair Actions"]) {
    assert.ok(!offered(root).includes(label), `${label} is out of scope`);
  }
});

test("picking a section reveals it and names the editor to land in", (t) => {
  const { root, store } = renderBlock(t, creature("5.5e"));

  const item = [...root.querySelectorAll<HTMLElement>(".name-menu .cm-submenu .cm-item")].find(
    (li) => li.textContent === "Bonus Actions",
  )!;
  fireEvent.click(item);

  assert.deepEqual([...store.getSession().revealedSections], ["bonusActions"]);
  assert.equal(store.getSession().pendingFocus, "section:bonusActions");
});

test("a revealed section leaves the menu", (t) => {
  const { root } = renderBlock(t, creature("5.5e"), { revealedSections: ["reactions"] });

  assert.ok(!offered(root).includes("Reactions"));
});

test("an empty revealed section stays revealed — nothing prunes it", (t) => {
  // The counterpart of a basics row, which drops off the moment it reads empty.
  // Prose commits on a typing debounce, so a section that came and went with
  // its own emptiness would vanish under the caret of anyone retyping a word.
  const monster = creature("5.5e");
  const { store } = renderBlock(t, monster, { revealedSections: ["traits"] });

  store.refresh();

  assert.deepEqual([...store.getSession().revealedSections], ["traits"]);
});
