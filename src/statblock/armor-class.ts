/**
 * Armor-class arithmetic and presentation.
 *
 * D&D Beyond stores a single number, but a creature's armor class is really two
 * things added together: what its Dexterity alone would give it (`10 + DEX mod`)
 * and what its armor is worth on top. The editor shows that split so the author
 * can see and edit either half — and so a Dexterity change can offer the class
 * that keeps the armor worth what it was.
 *
 * Rules and presentation knowledge only; the DDB field ids live in the adapter.
 */
import { abilityModifier } from "./compute.js";
import type { ArmorClass, Monster } from "./model.js";

/** How armor class reads in a stat block: "16 (natural armor)", or bare "16". */
export function armorClassText({ value, type }: ArmorClass): string {
  return type ? `${value} (${type})` : String(value);
}

/** What the creature's Dexterity alone is worth: the form's readonly prefix. */
export function unarmoredAc(monster: Monster): number {
  return 10 + abilityModifier(monster.abilities.dex);
}

/**
 * The part of an armor class its armor accounts for. Negative where the class is
 * worse than unarmored, which a creature in heavy armor genuinely can be.
 */
export function armorBonus(value: number, base: number): number {
  return value - base;
}
