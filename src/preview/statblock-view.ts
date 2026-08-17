/**
 * Dispatches to the stat-block renderer for a monster's ruleset. Callers (the
 * panel) depend only on this; the 2014/2024 split lives behind it.
 */
import type { Monster } from "../statblock/model.js";
import { parseChallengeRating } from "../statblock/compute.js";
import { render2014 } from "./render-2014.js";
import { render2024 } from "./render-2024.js";

/** Builds the stat-block element for a monster in its authored layout. */
export function renderStatBlock(monster: Monster): HTMLElement {
  return monster.ruleset === "2014" ? render2014(monster) : render2024(monster);
}

/** Numeric challenge rating, e.g. for encounter math. */
export function numericCr(monster: Monster): number {
  return parseChallengeRating(monster.challengeRating);
}
