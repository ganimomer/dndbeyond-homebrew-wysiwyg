/**
 * Dispatches to the stat-block renderer for a monster's ruleset. Callers (the
 * overlay) depend only on this; the 5e/5.5e split lives behind it.
 */
import type { Monster } from "../statblock/model.js";
import { parseChallengeRating } from "../statblock/compute.js";
import { render5e } from "./render-5e.js";
import { render55e } from "./render-55e.js";

/** Builds the stat-block element for a monster in its authored layout. */
export function renderStatBlock(monster: Monster): HTMLElement {
  return monster.ruleset === "5e" ? render5e(monster) : render55e(monster);
}

/** Numeric challenge rating, e.g. for encounter math. */
export function numericCr(monster: Monster): number {
  return parseChallengeRating(monster.challengeRating);
}
