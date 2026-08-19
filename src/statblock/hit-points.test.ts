import { test } from "node:test";
import assert from "node:assert/strict";
import type { HitPoints } from "./model.js";
import { expectedAverage, expectedModifier, hitPointsText } from "./hit-points.js";

const hp = (partial: Partial<HitPoints> = {}): HitPoints => ({
  average: 0,
  dieCount: 0,
  dieValue: 0,
  modifier: 0,
  ...partial,
});

test("prints the average with its dice and modifier", () => {
  assert.equal(
    hitPointsText(hp({ average: 195, dieCount: 23, dieValue: 8, modifier: 92 })),
    "195 (23d8 + 92)",
  );
  assert.equal(
    hitPointsText(hp({ average: 1, dieCount: 1, dieValue: 4, modifier: -1 })),
    "1 (1d4 - 1)",
  );
});

test("omits a zero modifier, and the dice when there are none", () => {
  assert.equal(hitPointsText(hp({ average: 4, dieCount: 1, dieValue: 8 })), "4 (1d8)");
  // A monster whose hit points were typed as a flat number: no dice to print.
  assert.equal(hitPointsText(hp({ average: 30, modifier: 5 })), "30");
});

test("the average a dice pool works out to is its mean, rounded down", () => {
  // The sample vampire: 23 × 4.5 = 103.5, + 92 = 195.5 → 195.
  assert.equal(expectedAverage(hp({ dieCount: 23, dieValue: 8, modifier: 92 })), 195);
  // 5d6 alone: 17.5 → 17.
  assert.equal(expectedAverage(hp({ dieCount: 5, dieValue: 6 })), 17);
});

test("the expected average never drops below 1", () => {
  // 1d4 - 1 averages 1.5, but a big penalty could take a creature to zero.
  assert.equal(expectedAverage(hp({ dieCount: 1, dieValue: 4, modifier: -1 })), 1);
  assert.equal(expectedAverage(hp({ dieCount: 1, dieValue: 4, modifier: -20 })), 1);
});

test("the expected modifier is the Constitution modifier once per die", () => {
  assert.equal(expectedModifier(hp({ dieCount: 23 }), 4), 92);
  assert.equal(expectedModifier(hp({ dieCount: 6 }), -1), -6);
  assert.equal(expectedModifier(hp({ dieCount: 0 }), 4), 0);
});
