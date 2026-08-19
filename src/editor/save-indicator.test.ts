import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SaveState } from "./autosave.js";

// save-indicator builds DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { applySaveState, resolveOrigin, HEADER_ORIGIN } = await import("./save-indicator.js");
const { saveSlot } = await import("../preview/dom.js");

const state = (status: SaveState["status"], ...origins: string[]): SaveState => ({
  status,
  origins: new Set(origins),
});

/** A scope with a header slot plus a slot for each named section. */
function scopeWith(...sections: string[]): HTMLElement {
  const root = jsdom.window.document.createElement("div");
  root.append(saveSlot(HEADER_ORIGIN), ...sections.map(saveSlot));
  return root;
}

const slotFor = (scope: ParentNode, origin: string) =>
  scope.querySelector<HTMLElement>(`[data-save-origin="${origin}"]`)!;

const noop = () => {};

test("idle leaves every slot empty", () => {
  const scope = scopeWith("traits", "actions");
  applySaveState(scope, state("idle"), noop);
  for (const slot of scope.querySelectorAll("[data-save-origin]")) {
    assert.equal(slot.childNodes.length, 0);
  }
});

test("saving shows a spinner only in the originating section's slot", () => {
  const scope = scopeWith("traits", "actions");
  applySaveState(scope, state("saving", "traits"), noop);

  assert.equal(slotFor(scope, "traits").querySelectorAll(".save-spinner").length, 1);
  assert.equal(slotFor(scope, "actions").childNodes.length, 0);
  assert.equal(slotFor(scope, HEADER_ORIGIN).childNodes.length, 0);
});

test("several origins on one save each get their own spinner", () => {
  const scope = scopeWith("traits", "actions");
  applySaveState(scope, state("saving", "traits", HEADER_ORIGIN), noop);

  assert.ok(slotFor(scope, "traits").querySelector(".save-spinner"));
  assert.ok(slotFor(scope, HEADER_ORIGIN).querySelector(".save-spinner"));
  assert.equal(slotFor(scope, "actions").childNodes.length, 0);
});

test("a section with no slot in this layout falls back to the header", () => {
  // The 5e Traits block has no heading, so no slot is rendered for it.
  const scope = scopeWith("actions");
  assert.equal(resolveOrigin(scope, "traits"), HEADER_ORIGIN);
  assert.equal(resolveOrigin(scope, "actions"), "actions");

  applySaveState(scope, state("saving", "traits"), noop);
  assert.ok(
    slotFor(scope, HEADER_ORIGIN).querySelector(".save-spinner"),
    "traits spinner shows in the header instead of vanishing",
  );
});

test("error swaps the spinner for a retry button that calls back", () => {
  const scope = scopeWith("traits");
  let retries = 0;
  applySaveState(scope, state("saving", "traits"), () => retries++);
  applySaveState(scope, state("error", "traits"), () => retries++);

  const slot = slotFor(scope, "traits");
  assert.equal(slot.querySelectorAll(".save-spinner").length, 0);
  const button = slot.querySelector<HTMLButtonElement>(".save-retry")!;
  assert.ok(button, "retry affordance rendered");
  assert.ok(slot.classList.contains("is-error"));

  button.dispatchEvent(new jsdom.window.Event("click"));
  assert.equal(retries, 1);
});

test("returning to idle clears the indicator", () => {
  const scope = scopeWith("traits");
  applySaveState(scope, state("saving", "traits"), noop);
  applySaveState(scope, state("idle"), noop);

  const slot = slotFor(scope, "traits");
  assert.equal(slot.childNodes.length, 0);
  assert.equal(slot.classList.contains("is-saving"), false);
});

test("re-applying the same state leaves the spinner element untouched", () => {
  // Replacing it would restart the CSS animation on every render tick.
  const scope = scopeWith("traits");
  applySaveState(scope, state("saving", "traits"), noop);
  const first = slotFor(scope, "traits").firstChild;
  applySaveState(scope, state("saving", "traits"), noop);
  assert.equal(slotFor(scope, "traits").firstChild, first);
});
