import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderInShadowRoot } from "../../test-support/render.js";
import { NameField } from "./NameField.js";

function setup(t: import("node:test").TestContext, name = "Vampire") {
  const calls: string[] = [];
  const view = renderInShadowRoot(t, <NameField name={name} onCommit={(v) => calls.push(v)} />);
  const field = view.root.querySelector<HTMLElement>(".name")!;
  return { ...view, field, calls };
}

/** Types into the contenteditable the way a keypress would. */
const type = (node: HTMLElement, text: string) => {
  node.textContent = text;
  fireEvent.input(node);
};

test("blur commits the edited name", (t) => {
  const { field, calls } = setup(t);

  type(field, "Vampire Spawn");
  fireEvent.blur(field);

  assert.deepEqual(calls, ["Vampire Spawn"]);
});

test("Enter commits without leaving a newline in the name", (t) => {
  const { field, calls } = setup(t);

  type(field, "Vampire Lord");
  // Enter must not reach the contenteditable, or it inserts a line break.
  const notPrevented = fireEvent.keyDown(field, { key: "Enter" });
  assert.equal(notPrevented, false, "the keypress was prevented");

  fireEvent.blur(field); // Enter commits by blurring; jsdom won't do that for us
  assert.deepEqual(calls, ["Vampire Lord"]);
  assert.ok(!field.textContent!.includes("\n"));
});

test("Escape reverts to the stored name and commits nothing", (t) => {
  const { field, calls } = setup(t, "Vampire");

  type(field, "Half-typed nonsen");
  fireEvent.keyDown(field, { key: "Escape" });

  assert.equal(field.textContent, "Vampire");
  fireEvent.blur(field);
  assert.deepEqual(calls, []);
});

test("an unchanged blur commits nothing", (t) => {
  // Focusing and tabbing away must not spin autosave.
  const { field, calls } = setup(t, "Vampire");

  fireEvent.blur(field);

  assert.deepEqual(calls, []);
});

test("whitespace and pasted newlines collapse to a single-line name", (t) => {
  const { field, calls } = setup(t);

  type(field, "  Vampire\nof the\n  Mists  ");
  fireEvent.blur(field);

  assert.deepEqual(calls, ["Vampire of the Mists"]);
});

test("the committed text is normalized in place, so the next blur is a no-op", (t) => {
  const { field, calls } = setup(t);

  type(field, "  Vampire Spawn  ");
  fireEvent.blur(field);
  fireEvent.blur(field);

  assert.equal(field.textContent, "Vampire Spawn");
  assert.deepEqual(calls, ["Vampire Spawn"]);
});

test("an empty name renders the placeholder, and typing clears it", (t) => {
  const { field } = setup(t, "");

  assert.equal(field.textContent, "");
  assert.ok(field.classList.contains("is-empty"), "empty name should show the prompt");

  type(field, "V");
  assert.ok(!field.classList.contains("is-empty"));

  type(field, "");
  assert.ok(field.classList.contains("is-empty"), "prompt should come back when cleared");
});

test("clearing a name commits an empty string rather than the old one", (t) => {
  const { field, calls } = setup(t, "Vampire");

  type(field, "");
  fireEvent.blur(field);

  assert.deepEqual(calls, [""]);
});

test("follows the name when it changes underneath", (t) => {
  const { field, rerender } = setup(t, "Vampire");

  rerender(<NameField name="Dread Vampire" onCommit={() => {}} />);

  assert.equal(field.textContent, "Dread Vampire", "the same node, retitled");
});

test("the field carries the focus key the panel restores to", (t) => {
  const { field } = setup(t);

  assert.equal(field.dataset.focusKey, "name");
  assert.equal(field.getAttribute("aria-label"), "Creature name");
  assert.ok(field.isContentEditable || field.getAttribute("contenteditable"));
});
