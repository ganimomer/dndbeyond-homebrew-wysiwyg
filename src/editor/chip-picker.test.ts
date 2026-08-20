import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// chip-picker builds DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;
// jsdom has no layout, so it leaves scrollIntoView unimplemented; the picker
// calls it purely to keep the highlight in view.
jsdom.window.Element.prototype.scrollIntoView = () => {};

const { ChipPicker } = await import("./chip-picker.js");

const DAMAGE = ["Acid", "Cold", "Fire", "Force", "Lightning", "Necrotic"];

const click = (el: Element) =>
  el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));
const press = (el: Element, key: string) =>
  el.dispatchEvent(new jsdom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

/**
 * The mounted picker's click-away teardown, kept so the next `setup` can detach
 * it: it lives on `window` rather than in the tree, so it would otherwise
 * outlive the test that opened it and answer the next one's clicks.
 */
let disposeLast: (() => void) | null = null;

function setup(labels: string[] = DAMAGE) {
  disposeLast?.();
  const taken: string[] = [];
  const picker = new ChipPicker(
    labels.map((label) => ({ label, onClick: () => taken.push(label) })),
    { label: "Add to damageResistances" },
  );
  disposeLast = () => picker.destroy();

  // Attached, because the click-away listens on `window` — a detached tree has
  // no path leading there.
  jsdom.window.document.body.replaceChildren(picker.element);

  const root = picker.element;
  const filter = root.querySelector<HTMLInputElement>(".cp-filter")!;
  const trigger = root.querySelector<HTMLButtonElement>(".cp-trigger")!;
  const visible = () =>
    [...root.querySelectorAll<HTMLElement>(".cp-option")]
      .filter((li) => !li.hidden)
      .map((li) => li.textContent ?? "");
  const active = () => root.querySelector<HTMLElement>(".cp-option.is-active")?.textContent ?? null;

  return { picker, root, filter, trigger, taken, visible, active };
}

/** Types into the filter box the way a keypress would. */
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new jsdom.window.Event("input", { bubbles: true }));
};

/** A click on the page somewhere the picker isn't. */
const clickAway = () => {
  const elsewhere = jsdom.window.document.createElement("div");
  jsdom.window.document.body.append(elsewhere);
  click(elsewhere);
  elsewhere.remove();
};

test("closed, the picker shows a ＋ and nothing else", () => {
  const { root, filter } = setup();

  assert.equal(root.classList.contains("open"), false);
  assert.equal(filter.getAttribute("aria-expanded"), "false");
  assert.notEqual(jsdom.window.document.activeElement, filter);
});

test("the options are in the DOM before it's ever opened", () => {
  // The editing suites read a row's offer without opening its picker.
  const { visible } = setup();

  assert.deepEqual(visible(), DAMAGE);
});

test("opening focuses the filter box and highlights the first option", () => {
  const { trigger, filter, active } = setup();

  click(trigger);

  assert.equal(jsdom.window.document.activeElement, filter);
  assert.equal(filter.getAttribute("aria-expanded"), "true");
  assert.equal(active(), "Acid");
});

test("typing hides what doesn't match, keeping the rest in source order", () => {
  const { trigger, filter, visible, active } = setup();
  click(trigger);

  type(filter, "o");

  assert.deepEqual(visible(), ["Cold", "Force", "Necrotic"]);
  assert.equal(active(), "Cold", "the highlight follows to the first match");
});

test("the filter ignores case and matches inside a label", () => {
  const { trigger, filter, visible } = setup();
  click(trigger);

  type(filter, "NIN");

  assert.deepEqual(visible(), ["Lightning"]);
});

test("a filter matching nothing says so, and Enter takes nothing", () => {
  const { trigger, filter, root, visible, taken } = setup();
  click(trigger);

  type(filter, "psychic");

  assert.deepEqual(visible(), []);
  assert.equal(root.querySelector<HTMLElement>(".cp-empty")!.hidden, false);
  press(filter, "Enter");
  assert.deepEqual(taken, []);
});

test("clearing the filter brings every option back", () => {
  const { trigger, filter, root, visible } = setup();
  click(trigger);
  type(filter, "fire");

  type(filter, "");

  assert.deepEqual(visible(), DAMAGE);
  assert.equal(root.querySelector<HTMLElement>(".cp-empty")!.hidden, true);
});

test("the arrows walk the options and wrap at both ends", () => {
  const { trigger, filter, active } = setup();
  click(trigger);

  press(filter, "ArrowDown");
  assert.equal(active(), "Cold");
  press(filter, "ArrowUp");
  assert.equal(active(), "Acid");
  press(filter, "ArrowUp");
  assert.equal(active(), "Necrotic", "up from the first wraps to the last");
  press(filter, "ArrowDown");
  assert.equal(active(), "Acid");
});

test("the arrows skip what the filter has hidden", () => {
  const { trigger, filter, active } = setup();
  click(trigger);
  type(filter, "o"); // Cold, Force, Necrotic

  press(filter, "ArrowDown");
  assert.equal(active(), "Force");
  press(filter, "ArrowDown");
  assert.equal(active(), "Necrotic");
  press(filter, "ArrowDown");
  assert.equal(active(), "Cold");
});

test("Enter takes the highlighted option and closes", () => {
  const { trigger, filter, root, taken } = setup();
  click(trigger);
  type(filter, "fo"); // Force

  press(filter, "Enter");

  assert.deepEqual(taken, ["Force"]);
  assert.equal(root.classList.contains("open"), false);
});

test("clicking an option takes that one, not the highlight", () => {
  const { trigger, root, taken } = setup();
  click(trigger);

  const fire = [...root.querySelectorAll<HTMLElement>(".cp-option")].find(
    (li) => li.textContent === "Fire",
  )!;
  click(fire);

  assert.deepEqual(taken, ["Fire"]);
});

test("hovering an option moves the highlight to it", () => {
  const { trigger, root, active } = setup();
  click(trigger);

  const fire = [...root.querySelectorAll<HTMLElement>(".cp-option")].find(
    (li) => li.textContent === "Fire",
  )!;
  fire.dispatchEvent(new jsdom.window.MouseEvent("mouseenter", { bubbles: false }));

  assert.equal(active(), "Fire");
});

test("Escape, a second click on the ＋, and a click away all close it", () => {
  for (const dismiss of ["escape", "trigger", "away"] as const) {
    const { trigger, filter, root } = setup();
    click(trigger);
    assert.equal(root.classList.contains("open"), true);

    if (dismiss === "escape") press(filter, "Escape");
    if (dismiss === "trigger") click(trigger);
    if (dismiss === "away") clickAway();

    assert.equal(root.classList.contains("open"), false, dismiss);
  }
});

test("taking an option hands focus back to the ＋", () => {
  // It must leave the filter box: the panel skips its re-render while one holds
  // the caret, so the chip this just committed would never reach the block.
  const { trigger, filter } = setup();
  click(trigger);
  type(filter, "fo");

  press(filter, "Enter");

  assert.equal(jsdom.window.document.activeElement, trigger);
});

test("Escape puts focus back on the ＋", () => {
  const { trigger, filter } = setup();
  click(trigger);

  press(filter, "Escape");

  assert.equal(jsdom.window.document.activeElement, trigger);
});

test("the click that opens it is not also a click away from it", () => {
  const { trigger, root } = setup();

  click(trigger);

  assert.equal(root.classList.contains("open"), true);
});

test("a click inside the picker leaves it open", () => {
  const { trigger, filter, root } = setup();
  click(trigger);

  click(filter);

  assert.equal(root.classList.contains("open"), true);
});

test("reopening starts from a cleared filter", () => {
  const { trigger, filter, visible } = setup();
  click(trigger);
  type(filter, "fire");
  press(filter, "Escape");

  click(trigger);

  assert.equal(filter.value, "");
  assert.deepEqual(visible(), DAMAGE);
});

test("keys do nothing while it's closed", () => {
  const { filter, taken, active } = setup();

  press(filter, "ArrowDown");
  press(filter, "Enter");

  assert.deepEqual(taken, []);
  assert.equal(active(), null);
});

test("destroy detaches the click-away, so a discarded picker stops listening", () => {
  const { picker, trigger, root } = setup();
  click(trigger);

  picker.destroy();
  // Re-open the closed picker's markup by hand: were the listener still
  // attached, this stray click would close it again.
  root.classList.add("open");
  clickAway();

  assert.equal(root.classList.contains("open"), true);
});
