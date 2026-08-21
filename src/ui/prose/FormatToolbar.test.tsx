/**
 * The bar that says what the caret is sitting in.
 *
 * Its whole job is to be *readable* — a new entry is created with bold and
 * italic switched on before there is any text to show it — and to run its
 * commands without taking the selection away from the editor underneath.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderInShadowRoot } from "../../test-support/render.js";
import { FormatToolbar } from "./FormatToolbar.js";
import { NO_FORMAT, type TextFormat } from "../../editor/prose-editor.js";

const button = (root: ShadowRoot, label: string) =>
  root.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

test("an unformatted caret lights nothing", (t) => {
  const { root } = renderInShadowRoot(t, <FormatToolbar format={NO_FORMAT} onToggle={() => {}} />);

  assert.equal(button(root, "Bold").getAttribute("aria-pressed"), "false");
  assert.equal(button(root, "Italic").getAttribute("aria-pressed"), "false");
});

test("each button reports its own format, not the other's", (t) => {
  const { root } = renderInShadowRoot(
    t,
    <FormatToolbar format={{ bold: true, italic: false }} onToggle={() => {}} />,
  );

  assert.equal(button(root, "Bold").getAttribute("aria-pressed"), "true");
  assert.equal(button(root, "Italic").getAttribute("aria-pressed"), "false");
});

test("clicking a button asks for that format", (t) => {
  const asked: TextFormat[] = [];
  const { root } = renderInShadowRoot(
    t,
    <FormatToolbar format={NO_FORMAT} onToggle={(f) => asked.push(f)} />,
  );

  fireEvent.click(button(root, "Italic"));
  assert.deepEqual(asked, ["italic"]);
});

test("mousedown is refused, so the caret stays where the author left it", (t) => {
  // The selection is the argument to the command the click runs. A button that
  // took focus would destroy it — and would drop `:focus-within`, taking the
  // toolbar off screen mid-click.
  const { root } = renderInShadowRoot(t, <FormatToolbar format={NO_FORMAT} onToggle={() => {}} />);

  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  button(root, "Bold").dispatchEvent(event);

  assert.ok(event.defaultPrevented, "the button never takes focus");
});

test("it announces itself as a toolbar", (t) => {
  const { root } = renderInShadowRoot(t, <FormatToolbar format={NO_FORMAT} onToggle={() => {}} />);

  assert.ok(root.querySelector('[role="toolbar"][aria-label="Text formatting"]'));
});
