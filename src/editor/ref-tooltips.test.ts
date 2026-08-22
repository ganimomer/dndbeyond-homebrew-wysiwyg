import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { ReferenceSource, ReferenceTooltip, RefToken } from "../adapter/types.js";
import { RefTooltips } from "./ref-tooltips.js";

/**
 * The controller, in a real shadow root — which is where it has to work, and
 * where event retargeting behaves differently enough to be worth the setup.
 *
 * Timers are driven by hand rather than waited on: the delays are the point of
 * several of these, and a test that sleeps 250ms twelve times is a test nobody
 * runs.
 */

const POPUP = "#microbrewery-tooltip";
const OPEN = 250;
const CLOSE = 120;

function tooltipFor(text: string): ReferenceTooltip {
  return { html: `<div class="tooltip tooltip-condition">${text}</div>`, type: "condition" };
}

/** A source that records what it was asked, and answers whatever it's told to. */
function stubSource(answer: (token: RefToken) => ReferenceTooltip | null = () => tooltipFor("def")) {
  const asked: RefToken[] = [];
  const source: ReferenceSource = {
    async lookup(token) {
      asked.push(token);
      return answer(token);
    },
  };
  return { source, asked };
}

function hover(element: Element, relatedTarget: EventTarget | null = null): void {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget }));
}

function unhover(element: Element, relatedTarget: EventTarget | null = null): void {
  element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget }));
}

const TOKEN = `<span class="ref" data-ref="condition">Grappled</span>`;

function mount(t: TestContext, source: ReferenceSource, markup = TOKEN) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(host);
  const token = root.querySelector<HTMLElement>("[data-ref], b, strong")!;
  t.after(() => {
    host.remove();
    document.querySelectorAll(POPUP).forEach((node) => node.remove());
  });
  const controller = new RefTooltips({
    scope: root,
    source,
    openDelayMs: OPEN,
    closeDelayMs: CLOSE,
  });
  controller.start();
  t.after(() => controller.stop());
  return { root, token, controller };
}

function popup(): HTMLElement | null {
  return document.querySelector<HTMLElement>(POPUP);
}

test("nothing is asked before the open delay elapses", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN - 1);

  assert.deepEqual(asked, []);
  assert.equal(popup(), null);
});

test("after the delay the definition appears in the light DOM", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource(() => tooltipFor("Grappled means…"));
  const { token, root } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(asked, [{ ref: "condition", slug: undefined, text: "Grappled" }]);
  const shown = popup();
  assert.ok(shown, "popup was not created");
  // In `document.body`, not the shadow root: that is where DDB's stylesheet is,
  // and where Lexical's observer can't see it.
  assert.equal(shown.parentElement, document.body);
  assert.equal(root.querySelector(POPUP), null);
  assert.equal(shown.className, "waterdeep-tooltip");
  assert.match(shown.innerHTML, /Grappled means…/);
  assert.equal(shown.style.pointerEvents, "none");
});

test("the token's markup is untouched by a full hover cycle", async (t) => {
  // The invariant Lexical depends on. If this ever fails, the reconciler and
  // the autosave debounce are both in play.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);
  const before = token.outerHTML;

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();
  unhover(token);
  t.mock.timers.tick(CLOSE);

  assert.equal(token.outerHTML, before);
});

test("leaving the token hides it again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(popup()?.style.display, "block");

  unhover(token);
  t.mock.timers.tick(CLOSE);

  assert.equal(popup()?.style.display, "none");
});

test("crossing between a token's own nodes is not a departure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const markup = `<span class="ref" data-ref="condition"><strong>Grap</strong><em>pled</em></span>`;
  const { token } = mount(t, source, markup);

  hover(token.querySelector("strong")!);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();

  // Pointer moves from the bold half to the italic half — same token.
  unhover(token.querySelector("strong")!, token.querySelector("em"));
  t.mock.timers.tick(CLOSE);

  assert.equal(popup()?.style.display, "block");
});

test("a definition that arrives after the pointer left is dropped", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve!: (value: ReferenceTooltip) => void;
  const source: ReferenceSource = {
    lookup: () => new Promise<ReferenceTooltip>((r) => (resolve = r)),
  };
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  unhover(token);
  t.mock.timers.tick(CLOSE);
  resolve(tooltipFor("too late"));
  await Promise.resolve();
  await Promise.resolve();

  assert.notEqual(popup()?.style.display, "block");
});

test("Escape dismisses it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(popup()?.style.display, "none");
});

test("scrolling the block dismisses it, rather than leaving it behind", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token, root } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();

  token.dispatchEvent(new Event("scroll", { bubbles: false }));
  root.dispatchEvent(new Event("scroll"));

  assert.equal(popup()?.style.display, "none");
});

test("a token we don't understand is never looked up", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { root } = mount(t, source, `<p>plain <b>prose</b></p>`);

  hover(root.querySelector("b")!);
  t.mock.timers.tick(OPEN);

  assert.deepEqual(asked, []);
});

test("a data-slug is passed through as the lookup key", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const markup = `<span class="ref" data-ref="rules" data-slug="shape-shifting">shape-shifts</span>`;
  const { token } = mount(t, source, markup);

  hover(token);
  t.mock.timers.tick(OPEN);

  assert.deepEqual(asked, [{ ref: "rules", slug: "shape-shifting", text: "shape-shifts" }]);
});

test("stop() takes the popup off DDB's page and stops listening", async (t) => {
  // The overlay is closed and re-opened on every SPA navigation, so a
  // controller that left a node or a listener behind would accumulate them.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { token, controller } = mount(t, source);

  hover(token);
  t.mock.timers.tick(OPEN);
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(popup(), "popup should exist before stop()");

  controller.stop();

  assert.equal(popup(), null, "popup outlived stop()");

  hover(token);
  t.mock.timers.tick(OPEN);
  assert.equal(asked.length, 1, "a hover after stop() still reached the source");
});

test("stop() is safe on a controller that never started", (t) => {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  t.after(() => host.remove());

  assert.doesNotThrow(() => new RefTooltips({ scope: root, source: stubSource().source }).stop());
});
