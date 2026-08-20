/**
 * Taking a section back off the block: one click when there is nothing in it,
 * and a confirm when there is — because removing it clears D&D Beyond's field.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type Ruleset, type SectionKey } from "../../statblock/model.js";
import { fireEvent } from "../../test-support/render.js";
import { renderBlock } from "../../test-support/editor.js";
import { SECTION_LABEL } from "./section-registry.js";

const creature = (ruleset: Ruleset, overrides: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  ruleset,
  ...overrides,
});

/**
 * A section's trash, by the name it gives itself. Matched exactly rather than
 * by suffix, or "Remove Actions" would also find Reactions'.
 */
const trash = (root: ShadowRoot, section: SectionKey): HTMLElement => {
  const found = root.querySelector<HTMLElement>(
    `[aria-label="Remove ${SECTION_LABEL[section]}"]`,
  );
  assert.ok(found, `no trash for ${section}`);
  return found!;
};

/** A stub that records the write-backs a removal makes. */
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

for (const ruleset of ["5e", "5.5e"] as const) {
  test(`${ruleset} removes an empty section on one click, no questions asked`, (t) => {
    const monster = creature(ruleset);
    const { root, store, repaint } = renderBlock(t, monster, { revealedSections: ["actions"] });

    fireEvent.click(trash(root, "actions"));
    repaint();

    assert.deepEqual([...store.getSession().revealedSections], []);
    assert.equal(root.querySelector('[data-section="actions"]'), null, "off the block");
  });

  test(`${ruleset} asks before removing a section with prose in it`, (t) => {
    const monster = creature(ruleset, { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
    const { wrote, adapter } = recorder(monster);
    const { root } = renderBlock(t, monster, { adapter });

    fireEvent.click(trash(root, "actions"));

    assert.ok(root.querySelector(".sb-remove-section.is-armed"), "armed, not gone");
    assert.deepEqual(wrote, [], "and nothing written yet");
    assert.ok(root.querySelector('[data-section="actions"]'), "still on the block");
  });

  test(`${ruleset} clears D&D Beyond's field once the removal is confirmed`, (t) => {
    const monster = creature(ruleset, { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
    const { wrote, adapter } = recorder(monster);
    const { root, store, repaint } = renderBlock(t, monster, { adapter });

    fireEvent.click(trash(root, "actions"));
    fireEvent.click(root.querySelector<HTMLElement>(".sb-remove-confirm")!);
    // The stub page has no `observe()`, so stand in for the write echoing back.
    store.refresh();
    repaint();

    assert.deepEqual(wrote, [["actions", ""]]);
    assert.equal(root.querySelector('[data-section="actions"]'), null, "off the block");
  });
}

test("keeping the section disarms it and writes nothing", (t) => {
  const monster = creature("5.5e", { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
  const { wrote, adapter } = recorder(monster);
  const { root } = renderBlock(t, monster, { adapter });

  fireEvent.click(trash(root, "actions"));
  fireEvent.click(root.querySelector<HTMLElement>(".sb-remove-cancel")!);

  assert.equal(root.querySelector(".sb-remove-section.is-armed"), null);
  assert.deepEqual(wrote, []);
});

test("Escape disarms it", (t) => {
  const monster = creature("5.5e", { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
  const { root } = renderBlock(t, monster);

  fireEvent.click(trash(root, "actions"));
  assert.ok(root.querySelector(".sb-remove-section.is-armed"));

  fireEvent.keyDown(window, { key: "Escape" });

  assert.equal(root.querySelector(".sb-remove-section.is-armed"), null);
});

test("a click anywhere else disarms it", (t) => {
  const monster = creature("5.5e", { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
  const { root } = renderBlock(t, monster);

  fireEvent.click(trash(root, "actions"));
  assert.ok(root.querySelector(".sb-remove-section.is-armed"));

  // The overlay lives in a shadow root, so an outside click is only ever seen
  // on `window` — retargeted to the host by the time it gets there.
  fireEvent.click(document.body);

  assert.equal(root.querySelector(".sb-remove-section.is-armed"), null);
});

test("the click that arms it is not also a click away from it", (t) => {
  const monster = creature("5.5e", { descriptionHtml: { actions: "<p>Multiattack.</p>" } });
  const { root } = renderBlock(t, monster);

  fireEvent.click(trash(root, "actions"));

  assert.ok(root.querySelector(".sb-remove-section.is-armed"));
});

test("a removed section goes back on the Add section menu", (t) => {
  const monster = creature("5.5e");
  const { root, repaint } = renderBlock(t, monster, { revealedSections: ["reactions"] });
  const offered = () =>
    [...root.querySelectorAll(".sb-add-section .cm-item .cm-label")].map((n) => n.textContent);
  assert.ok(!offered().includes("Reactions"), "on the block, so not on offer");

  fireEvent.click(trash(root, "reactions"));
  repaint();

  assert.ok(offered().includes("Reactions"));
});

test("the Description below the block can be removed like any other section", (t) => {
  const monster = creature("5.5e");
  const { root, store, repaint } = renderBlock(t, monster, {
    revealedSections: ["characteristics"],
  });
  assert.ok(root.querySelector(".sb-description"), "on the page");

  fireEvent.click(trash(root, "characteristics"));
  repaint();

  assert.deepEqual([...store.getSession().revealedSections], []);
  assert.equal(root.querySelector(".sb-description"), null);
});
