import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { TextRow, type TextField } from "./TextRow.js";

function setup(t: import("node:test").TestContext, value = "", field: TextField = "languages") {
  const committed: Array<[TextField, string]> = [];
  const cleared: TextField[] = [];
  const view = renderInShadowRoot(
    t,
    <TextRow
      field={field}
      value={value}
      label="Languages"
      placeholder="languages…"
      onCommit={(f, v) => committed.push([f, v])}
      onClear={(f) => cleared.push(f)}
    />,
  );
  const input = view.root.querySelector<HTMLInputElement>(".sb-text-input")!;
  return { ...view, input, committed, cleared };
}

test("shows the value it was given, ready to type over", (t) => {
  const { input, root } = setup(t, "Common");

  assert.equal(input.value, "Common");
  assert.equal(input.placeholder, "languages…");
  assert.ok(root.querySelector(".sb-text-clear"), "carries a ✕ to drop it again");
  assert.equal(root.querySelector(".sb-text")?.getAttribute("data-field"), "languages");
});

test("commits when the user is finished, not as they type", (t) => {
  const { input, committed } = setup(t, "Common");

  input.value = "Common, Elvish";
  assert.deepEqual(committed, [], "nothing while typing");

  fireEvent.change(input);

  assert.deepEqual(committed, [["languages", "Common, Elvish"]]);
});

test("trims what it commits, and says nothing when unchanged", (t) => {
  const { input, committed } = setup(t, "Common");

  input.value = "  Common  ";
  fireEvent.change(input);

  assert.deepEqual(committed, [], "the same value is not an edit");
});

test("Enter means the user is done", async (t) => {
  const user = userEvent.setup();
  const { input, root } = setup(t, "");

  input.focus();
  await user.keyboard("Draconic");
  await user.keyboard("{Enter}");

  // Enter commits by blurring, because a standalone input with no <form> to
  // submit fires `change` on blur and nothing else. (jsdom doesn't emulate
  // blur→change, so the commit itself is covered by the `change` test above;
  // what matters here is that Enter lets go of the field.)
  assert.notEqual(root.activeElement, input, "Enter blurs the field");
  assert.equal(input.value, "Draconic");
});

test("the ✕ drops the field", async (t) => {
  const user = userEvent.setup();
  const { root, cleared } = setup(t, "Common", "gear");

  await user.click(root.querySelector(".sb-text-clear")!);

  assert.deepEqual(cleared, ["gear"]);
});

test("follows the value when it changes underneath", (t) => {
  const { input, rerender } = setup(t, "Common");

  rerender(
    <TextRow
      field="languages"
      value="Undercommon"
      label="Languages"
      placeholder="languages…"
      onCommit={() => {}}
      onClear={() => {}}
    />,
  );

  // An undo, or an edit made in D&D Beyond's own field, has to show here.
  assert.equal(input.value, "Undercommon");
});

test("leaves the box alone while the user is in it", (t) => {
  const { input, rerender } = setup(t, "Common");

  input.focus();
  input.value = "Common, Elv";

  rerender(
    <TextRow
      field="languages"
      value="Undercommon"
      label="Languages"
      placeholder="languages…"
      onCommit={() => {}}
      onClear={() => {}}
    />,
  );

  // This is the whole point of the conversion: a form mutation arriving
  // mid-word used to wipe what they had typed.
  assert.equal(input.value, "Common, Elv");
});
