/**
 * Tests the harness itself, and with it the assumption the whole UI rests on:
 * that Preact works inside a shadow root without help.
 *
 * It does, and the reason is worth writing down — Preact attaches listeners to
 * the elements themselves rather than delegating through a root node the way
 * React does, so nothing has to be told about the shadow boundary. This test is
 * what stops that from being a claim in a design doc.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { useState } from "preact/hooks";
import { renderInShadowRoot, userEvent } from "./render.js";

function Counter({ label = "clicked" }: { label?: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      {label} {count}
    </button>
  );
}

test("renders Preact into a shadow root", (t) => {
  const { getByRole, root } = renderInShadowRoot(t, <Counter />);

  assert.equal(getByRole("button").textContent, "clicked 0");
  // The component is genuinely behind the boundary, not in the light DOM.
  assert.equal(document.body.querySelector("button"), null);
  assert.ok(root.querySelector("button"));
});

test("handles events raised inside the shadow root", async (t) => {
  const user = userEvent.setup();
  const { getByRole } = renderInShadowRoot(t, <Counter />);

  await user.click(getByRole("button"));

  assert.equal(getByRole("button").textContent, "clicked 1");
});

test("keeps the DOM node across re-renders, so focus survives", (t) => {
  const { getByRole, root, rerender } = renderInShadowRoot(t, <Counter />);
  const button = getByRole("button");
  button.focus();

  rerender(<Counter label="pressed" />);

  // Same element, updated in place — this is what retires the panel's manual
  // focus save/restore.
  assert.equal(getByRole("button"), button);
  assert.equal(button.textContent, "pressed 0");
  // Inside a shadow root the *document's* activeElement is the host, so focus
  // has to be resolved against the root itself.
  assert.equal(root.activeElement, button);
});
