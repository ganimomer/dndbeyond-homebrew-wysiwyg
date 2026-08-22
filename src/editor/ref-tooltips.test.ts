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
const INTENT = 60;

/**
 * Runs the clock from a fresh hover to a painted popup: past the intent delay
 * so the lookup starts, letting its promise settle, then out the rest of the
 * display delay. Eleven tests would otherwise repeat this by hand.
 */
async function settle(t: TestContext): Promise<void> {
  t.mock.timers.tick(INTENT);
  await flushMicrotasks();
  t.mock.timers.tick(OPEN - INTENT);
  await flushMicrotasks();
}

/** `Promise.all` in `open()` adds a few ticks before the popup is painted. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

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
    intentDelayMs: INTENT,
  });
  controller.start();
  t.after(() => controller.stop());
  return { root, token, controller };
}

function popup(): HTMLElement | null {
  return document.querySelector<HTMLElement>(POPUP);
}

test("nothing is asked before the intent delay elapses", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(INTENT - 1);

  assert.deepEqual(asked, []);
  assert.equal(popup(), null);
});

test("a pointer crossing several tokens asks about none of them", (t) => {
  // What the single delay was really protecting, now stated directly: sweeping
  // a spell list must not fire a request per word.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const markup = ["Blinded", "Charmed", "Prone", "Stunned", "Poisoned"]
    .map((name) => `<span class="ref" data-ref="condition">${name}</span>`)
    .join(" ");
  const { root } = mount(t, source, markup);

  for (const token of root.querySelectorAll(".ref")) {
    hover(token);
    t.mock.timers.tick(INTENT / 2);
  }

  assert.deepEqual(asked, [], "a sweep should cost timers, not requests");
});

test("an answer that beats the delay still waits it out", async (t) => {
  // The perceptual promise the overlap trades against: warm and cold hovers
  // must appear at the same moment.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(INTENT);
  await flushMicrotasks();
  t.mock.timers.tick(OPEN - INTENT - 1);
  await flushMicrotasks();

  assert.notEqual(popup()?.style.display, "block", "the popup jumped the display delay");

  t.mock.timers.tick(1);
  await flushMicrotasks();

  assert.equal(popup()?.style.display, "block");
});

test("the request starts during the delay, not after it", async (t) => {
  // The whole point of the split: a cold lookup overlaps the wait instead of
  // being added to it.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  t.mock.timers.tick(INTENT);
  await flushMicrotasks();

  assert.equal(asked.length, 1, "the lookup should already be in flight");
  assert.notEqual(popup()?.style.display, "block", "but nothing painted yet");
});

test("after the delay the definition appears in the light DOM", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource(() => tooltipFor("Grappled means…"));
  const { token, root } = mount(t, source);

  hover(token);
  await settle(t);

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
  await settle(t);
  unhover(token);
  t.mock.timers.tick(CLOSE);

  assert.equal(token.outerHTML, before);
});

test("leaving the token hides it again", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  await settle(t);
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
  await settle(t);

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
  t.mock.timers.tick(INTENT);
  await flushMicrotasks();
  unhover(token);
  t.mock.timers.tick(CLOSE);
  resolve(tooltipFor("too late"));
  t.mock.timers.tick(OPEN);
  await flushMicrotasks();

  assert.notEqual(popup()?.style.display, "block");
});

test("Escape dismisses it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token } = mount(t, source);

  hover(token);
  await settle(t);

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(popup()?.style.display, "none");
});

test("scrolling the block dismisses it, rather than leaving it behind", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source } = stubSource();
  const { token, root } = mount(t, source);

  hover(token);
  await settle(t);

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
  t.mock.timers.tick(INTENT);

  assert.deepEqual(asked, [{ ref: "rules", slug: "shape-shifting", text: "shape-shifts" }]);
});

test("stop() takes the popup off DDB's page and stops listening", async (t) => {
  // The overlay is closed and re-opened on every SPA navigation, so a
  // controller that left a node or a listener behind would accumulate them.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { source, asked } = stubSource();
  const { token, controller } = mount(t, source);

  hover(token);
  await settle(t);
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
