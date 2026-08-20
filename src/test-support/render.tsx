/**
 * The shared harness for component tests.
 *
 * Two things it exists to hide:
 *
 *   1. **Cleanup.** `@testing-library/preact` auto-registers cleanup only when a
 *      global `afterEach` is present, and `node:test` exports its hooks rather
 *      than making them global. So each render registers its own teardown on the
 *      test's context.
 *   2. **The shadow root.** The editor overlay lives in one, and that is not a
 *      detail a component test may skip: focus, `activeElement` and event
 *      retargeting all behave differently in there. `renderInShadowRoot` is the
 *      default for anything that touches either.
 *
 * The DOM itself comes from `scripts/dom-setup.mjs`, installed process-wide
 * before any of this loads — which is why these are ordinary static imports.
 */
import type { TestContext } from "node:test";
import type { ComponentChild } from "preact";
import { render as preactRender } from "preact";
import { cleanup, render, type RenderResult } from "@testing-library/preact";
import { getQueriesForElement, type BoundFunctions, type queries } from "@testing-library/dom";

export * from "@testing-library/preact";
export { default as userEvent } from "@testing-library/user-event";

/** Renders into the document body, tearing down when the test ends. */
export function renderUi(t: TestContext, ui: ComponentChild): RenderResult {
  t.after(cleanup);
  return render(ui as Parameters<typeof render>[0]);
}

export interface ShadowRenderResult extends BoundFunctions<typeof queries> {
  /** The shadow root the component was rendered into. */
  root: ShadowRoot;
  /** The host element carrying it, already in the document. */
  host: HTMLElement;
  /** Re-renders into the same root, the way a state change would. */
  rerender(ui: ComponentChild): void;
}

/**
 * Renders into a fresh shadow root attached to the document.
 *
 * Queries are bound to the shadow root rather than `screen`, because
 * `screen`'s are bound to `document.body` and stop at the shadow boundary.
 */
export function renderInShadowRoot(t: TestContext, ui: ComponentChild): ShadowRenderResult {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  document.body.append(host);

  t.after(() => {
    preactRender(null, root as unknown as Element);
    host.remove();
  });

  const rerender = (next: ComponentChild) =>
    preactRender(next as never, root as unknown as Element);
  rerender(ui);

  return {
    ...getQueriesForElement(root as unknown as HTMLElement),
    root,
    host,
    rerender,
  };
}
