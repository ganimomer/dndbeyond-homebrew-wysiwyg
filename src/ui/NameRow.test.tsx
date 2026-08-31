/**
 * The stat block's own actions menu — specifically the one item that leaves the
 * editor, and the condition it waits on before it will.
 *
 * The other three items change the creature and are covered where their state
 * lives (legendary.test, lair.test, the two layouts' tests).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster } from "../statblock/model.js";
import { NameRow } from "./NameRow.js";
import { fireEvent } from "../test-support/render.js";
import { renderWithStore } from "../test-support/editor.js";

// The page the DOM harness pretends to be; see scripts/dom-setup.mjs.
const DETAILS = "https://www.dndbeyond.com/monsters/1-test";
const LABEL = "Go to details page";

const creature = (overrides: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  type: "Undead",
  ...overrides,
});

const trigger = (root: ShadowRoot) => root.querySelector<HTMLElement>(".name-menu .cm-trigger")!;

/** The menu's own rows — not the ones inside a row's flyout. */
const rows = (root: ShadowRoot): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(".name-menu > .cm > .cm-menu > .cm-item"),
];

/** A row's own label, which its flyout's labels must not be read into. */
const labelOf = (row: HTMLElement): string => row.querySelector(".cm-label")?.textContent ?? "";

/** Opens the menu and hands back the "Go to details page" row. */
function detailsItem(root: ShadowRoot): HTMLElement {
  fireEvent.click(trigger(root));
  const item = rows(root).find((li) => labelOf(li) === LABEL);
  assert.ok(item, `the menu offers "${LABEL}"`);
  return item!;
}

/** Records `window.open` calls for the duration of the test. */
function captureOpens(t: import("node:test").TestContext) {
  const calls: Array<[string, string | undefined]> = [];
  const original = window.open;
  window.open = ((url?: string | URL, target?: string) => {
    calls.push([String(url), target]);
    return null;
  }) as typeof window.open;
  t.after(() => {
    window.open = original;
  });
  return calls;
}

test("the menu offers the details page last, below the items that change the creature", (t) => {
  const { root } = renderWithStore(t, creature(), (s) => <NameRow monster={s.getMonster()!} />);
  fireEvent.click(trigger(root));

  assert.deepEqual(rows(root).map(labelOf), [
    "Use 5e stat block",
    "Make legendary",
    "Add lair",
    "Add section…",
    LABEL,
  ]);
});

test("with the form clean, it opens the creature's public page in a new tab", (t) => {
  const opens = captureOpens(t);
  const { root } = renderWithStore(t, creature(), (s) => <NameRow monster={s.getMonster()!} />);

  fireEvent.click(detailsItem(root));
  assert.deepEqual(opens, [[DETAILS, "_blank"]]);
});

test("an unsaved edit greys the item out and says why", (t) => {
  const opens = captureOpens(t);
  const { root, store, repaint } = renderWithStore(t, creature(), (s) => (
    <NameRow monster={s.getMonster()!} />
  ));

  // Still inside the debounce: nothing is in flight, but the form is behind.
  store.autosave.request("header");
  repaint();

  const item = detailsItem(root);
  assert.ok(item.classList.contains("disabled"));
  assert.equal(item.getAttribute("aria-disabled"), "true");
  assert.match(item.getAttribute("title") ?? "", /save/i);

  fireEvent.click(item);
  assert.deepEqual(opens, [], "a disabled row opens nothing");
  assert.ok(root.querySelector(".name-menu .cm.open"), "and leaves its tooltip reachable");
});

test("it comes back on its own when the save lands, without reopening the menu", async (t) => {
  const opens = captureOpens(t);
  const { root, store, repaint } = renderWithStore(t, creature(), (s) => (
    <NameRow monster={s.getMonster()!} />
  ));

  store.autosave.request("header");
  repaint();
  assert.ok(detailsItem(root).classList.contains("disabled"));

  // The menu stays open across the save; only `useSaveState` repaints it.
  await store.autosave.flush();

  const item = rows(root).find((li) => labelOf(li) === LABEL)!;
  assert.equal(item.classList.contains("disabled"), false);
  // Preact blanks a removed attribute rather than dropping it; either way there
  // is no longer a tooltip to show.
  assert.ok(!item.getAttribute("title"));

  fireEvent.click(item);
  assert.deepEqual(opens, [[DETAILS, "_blank"]]);
});
