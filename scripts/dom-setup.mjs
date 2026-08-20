/**
 * Installs a jsdom window as the process's global DOM, before anything else
 * loads.
 *
 * `node --test` gets this via `--import`, which runs it ahead of the test
 * bundle. That ordering is the whole point: ES module imports are hoisted, so a
 * test file that statically imports `preact` or `@testing-library/preact` —
 * both of which touch `document` at module scope — would otherwise blow up
 * before any in-file setup could run. Doing it here is what lets test files use
 * ordinary static imports instead of the install-globals-then-`await import()`
 * dance.
 *
 * Each test file is its own process, so each gets a clean document.
 */
import { JSDOM } from "jsdom";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>", {
  // Gives us requestAnimationFrame, which the editor overlay renders on.
  pretendToBeVisual: true,
  url: "https://www.dndbeyond.com/homebrew/creations/monsters/1-test/edit",
});

const { window } = jsdom;

/**
 * Globals jsdom must win, even though Node defines its own. `navigator` is the
 * one that actually bites (Node ≥21 has a stub); the rest are here so the DOM's
 * view of itself stays self-consistent.
 */
const OVERRIDE = new Set(["window", "document", "navigator", "location", "history", "self"]);

/**
 * Plain functions that read `this`. Copied bare they'd be called with
 * `globalThis` as the receiver and throw, so they're bound to the window.
 * Constructors are deliberately *not* in here — binding would cost them their
 * `prototype` and their static constants (`Node.ELEMENT_NODE` and friends).
 */
const BIND = new Set([
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "matchMedia",
  "getSelection",
  "scrollTo",
  "scrollBy",
  "alert",
  "confirm",
  "prompt",
]);

for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis && !OVERRIDE.has(key)) continue;

  let descriptor = Object.getOwnPropertyDescriptor(window, key);
  if (!descriptor) continue;

  // jsdom exposes `document`, `location` and friends as getters. Copied as
  // getters they'd be read-only out here, and a test that swaps in its own
  // document would fail — modules are strict mode, so the assignment throws.
  // Flatten them to plain writable values.
  if (descriptor.get) descriptor = { value: window[key], enumerable: descriptor.enumerable };

  if (BIND.has(key) && typeof descriptor.value === "function") {
    descriptor.value = descriptor.value.bind(window);
  }

  Object.defineProperty(globalThis, key, { ...descriptor, writable: true, configurable: true });
}
