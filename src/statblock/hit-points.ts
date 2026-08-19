/**
 * Hit-point arithmetic and presentation.
 *
 * D&D Beyond splits hit points across four controls and leaves the relationships
 * between them to the author: the average follows from the dice pool, and the
 * modifier is the creature's Constitution modifier once per Hit Die. The editor
 * offers those two derivations as hints rather than applying them, so a
 * hand-tuned average survives — which is why `expectedAverage` and
 * `expectedModifier` are separate from the stored values, not replacements
 * for them.
 *
 * Rules and presentation knowledge only; the DDB field ids live in the adapter.
 */
import type { HitPoints } from "./model.js";

/** The polyhedral dice DDB's Hit Die select offers, in its order. */
export const HIT_DIE_VALUES: readonly number[] = [4, 6, 8, 10, 12, 20];

/**
 * How hit points read in a stat block: "195 (23d8 + 92)". A zero modifier is
 * left off, and a creature with no dice pool prints its average alone.
 */
export function hitPointsText({ average, dieCount, dieValue, modifier }: HitPoints): string {
  if (!dieCount || !dieValue) return String(average);
  const mod = modifier ? ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}` : "";
  return `${average} (${dieCount}d${dieValue}${mod})`;
}

/**
 * The average the dice pool actually works out to: the mean roll rounded down,
 * as 5e prints it. Never less than 1 — a creature with hit points has at least
 * one, however punishing its Constitution.
 */
export function expectedAverage({ dieCount, dieValue, modifier }: HitPoints): number {
  const mean = (dieCount * (dieValue + 1)) / 2 + modifier;
  return Math.max(1, Math.floor(mean));
}

/** The modifier a creature's Constitution implies: `conMod` once per Hit Die. */
export function expectedModifier({ dieCount }: HitPoints, conMod: number): number {
  return dieCount * conMod;
}
