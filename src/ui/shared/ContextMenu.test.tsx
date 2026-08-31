/**
 * The kebab menu's one level of nesting: a row that opens rows of its own.
 *
 * The flat behaviour — what a row does, what a disabled one refuses to do — is
 * covered where the menus themselves live (NameRow.test, Artwork.test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "preact";
import "../sync-rendering.js";
import { ContextMenu, type MenuEntry } from "./ContextMenu.js";

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const escape = () =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

/** The mounted menu, unmounted by the next setup so its listeners go with it. */
let disposeLast: (() => void) | null = null;

function setup() {
  disposeLast?.();
  const taken: string[] = [];
  // Attached, because the click-away listens on `window` — a detached tree has
  // no path leading there.
  const host = document.createElement("div");
  document.body.replaceChildren(host);

  const items: MenuEntry[] = [
    { label: "Make legendary", onClick: () => taken.push("Make legendary") },
    {
      label: "Add section…",
      items: [
        { label: "Traits", onClick: () => taken.push("Traits") },
        { label: "Actions", onClick: () => taken.push("Actions") },
      ],
    },
  ];
  render(<ContextMenu items={items} />, host);
  disposeLast = () => render(null, host);

  const root = host.querySelector<HTMLElement>(".cm")!;
  return {
    taken,
    open: () => root.classList.contains("open"),
    trigger: root.querySelector<HTMLElement>(".cm-trigger")!,
    parent: root.querySelector<HTMLElement>(".cm-parent")!,
    leaf: (label: string) =>
      [...root.querySelectorAll<HTMLElement>(".cm-submenu .cm-item")].find(
        (li) => li.textContent === label,
      )!,
    flyout: () => root.querySelector<HTMLElement>(".cm-parent")!.classList.contains("is-open"),
  };
}

test("a row with rows of its own opens them without closing the menu", () => {
  const menu = setup();
  click(menu.trigger);

  click(menu.parent);

  assert.ok(menu.flyout(), "the flyout is showing");
  assert.ok(menu.open(), "and the menu it hangs off is still up");
});

test("clicking it again folds the flyout away", () => {
  const menu = setup();
  click(menu.trigger);
  click(menu.parent);

  click(menu.parent);

  assert.equal(menu.flyout(), false);
  assert.ok(menu.open());
});

test("picking from the flyout acts and closes the lot", () => {
  const menu = setup();
  click(menu.trigger);
  click(menu.parent);

  click(menu.leaf("Actions"));

  assert.deepEqual(menu.taken, ["Actions"]);
  assert.equal(menu.open(), false, "the menu is gone");
  assert.equal(menu.flyout(), false, "and so is the flyout");
});

test("Escape backs out one layer at a time", () => {
  const menu = setup();
  click(menu.trigger);
  click(menu.parent);

  escape();
  assert.equal(menu.flyout(), false, "the flyout first");
  assert.ok(menu.open(), "the menu is still up");

  escape();
  assert.equal(menu.open(), false, "then the menu");
});

test("a reopened menu starts at its top level", () => {
  const menu = setup();
  click(menu.trigger);
  click(menu.parent);

  click(menu.trigger);
  click(menu.trigger);

  assert.ok(menu.open());
  assert.equal(menu.flyout(), false);
});
