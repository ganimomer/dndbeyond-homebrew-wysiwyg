import { test } from "node:test";
import assert from "node:assert/strict";
import { menuPlacement } from "./menu-placement.js";

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 200, height: 300 };
const at = (left: number, top: number) => ({ left, right: left + 8, top, bottom: top + 18 });

test("a menu hangs below what opened it, aligned to its left edge", () => {
  // Below, because above would cover the words the author just typed.
  assert.deepEqual(menuPlacement(at(100, 200), SIZE, VIEWPORT), { left: 100, top: 222 });
});

test("a menu with no room below flips above", () => {
  const { top } = menuPlacement(at(100, 700), SIZE, VIEWPORT);
  assert.equal(top, 700 - 4 - 300);
});

test("a menu with room for neither stays below, where it can be scrolled to", () => {
  const { top } = menuPlacement(at(100, 40), SIZE, { width: 1000, height: 200 });
  assert.equal(top, 62);
});

test("a menu near the right edge is pulled back into the viewport", () => {
  const { left } = menuPlacement(at(950, 200), SIZE, VIEWPORT);
  assert.equal(left, 1000 - 200 - 8);
});

test("a menu wider than the viewport pins to the left edge", () => {
  const { left } = menuPlacement(at(100, 200), { width: 1200, height: 300 }, VIEWPORT);
  assert.equal(left, 8);
});
