/**
 * The Gear / Languages row, which is a one-line Lexical editor over a plain
 * D&D Beyond `<input>`.
 *
 * What these are mostly about is the thing an `<input>` could never do: the
 * macros D&D Beyond stores in those fields have to *read* as the items and
 * conditions they name, not as the markup that names them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { TextRow, type TextField } from "./TextRow.js";

/** The Gear field of D&D Beyond's own Warrior Veteran, verbatim. */
const GEAR =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

function row(props: Partial<Parameters<typeof TextRow>[0]> = {}) {
  return (
    <TextRow
      field="languages"
      value=""
      label="Languages"
      placeholder="languages…"
      onCommit={() => {}}
      onClear={() => {}}
      {...props}
    />
  );
}

function setup(t: import("node:test").TestContext, value = "", field: TextField = "languages") {
  const committed: Array<[TextField, string]> = [];
  const cleared: TextField[] = [];
  const view = renderInShadowRoot(
    t,
    row({
      field,
      value,
      label: field === "gear" ? "Gear" : "Languages",
      placeholder: field === "gear" ? "gear…" : "languages…",
      onCommit: (f, v) => committed.push([f, v]),
      onClear: (f) => cleared.push(f),
    }),
  );
  const box = view.root.querySelector<HTMLElement>(".sb-text-prose")!;
  return { ...view, box, committed, cleared };
}

test("shows the value it was given, ready to type over", (t) => {
  const { box, root } = setup(t, "Common");

  assert.equal(box.textContent, "Common");
  assert.equal(box.getAttribute("contenteditable"), "true");
  assert.equal(box.dataset.placeholder, "languages…");
  assert.ok(root.querySelector(".sb-text-clear"), "carries a ✕ to drop it again");
  assert.equal(root.querySelector(".sb-text")?.getAttribute("data-field"), "languages");
});

test("a gear macro reads as the item it names, not as the macro", (t) => {
  // The bug this row was rebuilt for: three references were printing as their
  // own markup, in the middle of an otherwise finished stat block.
  const { box } = setup(t, GEAR, "gear");

  assert.equal(box.textContent, "Greatsword, Heavy Crossbow, Splint Armor");
  const refs = [...box.querySelectorAll(".ref")];
  assert.deepEqual(
    refs.map((ref) => [ref.getAttribute("data-ref"), ref.getAttribute("data-slug"), ref.textContent]),
    [
      ["items", null, "Greatsword"],
      ["items", "crossbow, heavy", "Heavy Crossbow"],
      ["items", "splint", "Splint Armor"],
    ],
    "each one carries what the hover controller needs to resolve it",
  );
});

test("an empty row says what belongs in it", (t) => {
  const { box } = setup(t, "");

  assert.equal(box.textContent, "");
  assert.ok(box.classList.contains("is-empty"), "so the CSS can draw the placeholder");
});

test("Enter means the user is done", async (t) => {
  const { box, root } = setup(t, "Common");

  box.focus();
  assert.equal(root.activeElement, box, "the caret starts in the row");

  fireEvent.keyDown(box, { key: "Enter" });
  // The editor commits and blurs a microtask later — see `ProseEditor.onEnter`.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.notEqual(root.activeElement, box, "Enter lets go of the field");
});

test("the ✕ drops the field", async (t) => {
  const user = userEvent.setup();
  const { root, cleared } = setup(t, "Common", "gear");

  await user.click(root.querySelector(".sb-text-clear")!);

  assert.deepEqual(cleared, ["gear"]);
});

test("follows the value when it changes underneath", (t) => {
  const { box, rerender } = setup(t, "Common");

  rerender(row({ value: "Undercommon" }));

  // An undo, or an edit made in D&D Beyond's own field, has to show here.
  assert.equal(box.textContent, "Undercommon");
});

test("leaves the box alone while the user is in it", (t) => {
  const { box, rerender } = setup(t, "Common");

  box.focus();

  rerender(row({ value: "Undercommon" }));

  // This is the whole point of the conversion: a form mutation arriving
  // mid-word used to wipe what they had typed.
  assert.equal(box.textContent, "Common");
});
