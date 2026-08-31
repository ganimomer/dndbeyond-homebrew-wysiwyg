import { test } from "node:test";
import assert from "node:assert/strict";
import { tooltipPlacement } from "./tooltip-placement.js";

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 300, height: 200 };

/** A token `width` wide, centred at `x`, on a line whose top is `y`. */
function token(x: number, y: number, width = 60, height = 18) {
  return { left: x - width / 2, right: x + width / 2, top: y, bottom: y + height };
}

test("sits above the token, centred on it", () => {
  const { left, top, placement } = tooltipPlacement(token(500, 400), SIZE, VIEWPORT);
  assert.equal(placement, "above");
  assert.equal(left, 350); // 500 - 300/2
  assert.equal(top, 400 - 8 - 200);
});

test("flips below when there isn't room above", () => {
  const { top, placement } = tooltipPlacement(token(500, 40), SIZE, VIEWPORT);
  assert.equal(placement, "below");
  assert.equal(top, 40 + 18 + 8);
});

test("stays above when there is room on neither side", () => {
  // A token on a short viewport has nowhere good to go; above and clamped beats
  // below and off the bottom.
  const { top, placement } = tooltipPlacement(token(500, 40), SIZE, { width: 1000, height: 220 });
  assert.equal(placement, "above");
  assert.equal(top, 8);
});

test("clamps at the right edge rather than overflowing", () => {
  const { left } = tooltipPlacement(token(980, 400), SIZE, VIEWPORT);
  assert.equal(left, 1000 - 300 - 8);
});

test("clamps at the left edge rather than going negative", () => {
  const { left } = tooltipPlacement(token(20, 400), SIZE, VIEWPORT);
  assert.equal(left, 8);
});

test("a popup wider than the viewport pins to the left edge", () => {
  const { left } = tooltipPlacement(token(500, 400), { width: 1200, height: 200 }, VIEWPORT);
  assert.equal(left, 8);
});

test("never leaves the viewport, wherever the token is", () => {
  for (const x of [0, 5, 250, 500, 750, 995, 1000]) {
    for (const y of [0, 10, 100, 400, 780, 800]) {
      const { left, top } = tooltipPlacement(token(x, y), SIZE, VIEWPORT);
      assert.ok(left >= 0, `left ${left} at ${x},${y}`);
      assert.ok(left + SIZE.width <= VIEWPORT.width, `right edge at ${x},${y}`);
      assert.ok(top >= 0, `top ${top} at ${x},${y}`);
    }
  }
});

test("the gap is honoured", () => {
  const { top } = tooltipPlacement(token(500, 400), SIZE, VIEWPORT, 20);
  assert.equal(top, 400 - 20 - 200);
});
