/**
 * Armor-class arithmetic and presentation.
 *
 * D&D Beyond stores a single number, but a creature's armor class is really two
 * things added together: what its Dexterity alone would give it (`10 + DEX mod`)
 * and what its armor is worth on top. The editor shows that split so the author
 * can see and edit either half — and so a Dexterity change can offer the class
 * that keeps the armor worth what it was.
 *
 * The words in the parentheses are a *list*, because more than one thing can be
 * accounting for the number: "studded leather and shield". D&D Beyond stores it
 * as one free-text line, so reading it back is a parse — and an author's line
 * has to be read whichever way they wrote it, since they wrote it long before
 * the editor existed.
 *
 * Rules and presentation knowledge only; the DDB field ids live in the adapter.
 */
import { SHIELD } from "./armor.js";
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

/**
 * The things a qualifier names: "studded leather and shield" → two of them.
 *
 * Commas and the word "and" are both separators and neither is required, so
 * "plate, shield and a ring", "plate, shield, and a ring" and "plate, shield"
 * all read the same. That is the point — the string being parsed is one an
 * author typed, in whichever of those styles they favour.
 *
 * The cost is that a part which contains the word "and" is split in two. No
 * armor in the SRD is named that way, and the alternative — insisting on one
 * punctuation style — would misread far more real stat blocks than it fixed.
 */
export function hintParts(type: string): string[] {
  return type
    .split(/,|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** Parts back into the one line D&D Beyond stores, Oxford comma and all. */
export function hintText(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Whether the qualifier already names this, however the author spelt it. */
function names(type: string, part: string): boolean {
  const needle = part.trim().toLowerCase();
  return hintParts(type).some((held) => held.toLowerCase() === needle);
}

/**
 * The qualifier with `part` on the end, or unchanged where it is already there.
 *
 * Always on the end, never merged into the middle: what the parentheses read
 * best as is the armor first and what was added to it after.
 */
export function withHintPart(type: string, part: string): string {
  if (names(type, part)) return type;
  return hintText([...hintParts(type), part.trim()]);
}

/** The qualifier without `part`, leaving the rest of the list as it was. */
export function withoutHintPart(type: string, part: string): string {
  const needle = part.trim().toLowerCase();
  return hintText(hintParts(type).filter((held) => held.toLowerCase() !== needle));
}

/**
 * The armor class a shield's arrival in — or departure from — the Gear row is
 * offering, or nothing where there is nothing to offer.
 *
 * Two points *added to the class the block already states*, rather than a class
 * recomputed from scratch. A shield adds to whatever a creature had, and what
 * it had may be natural armor, a magic item, or a number a homebrew author
 * simply decided on; none of those are things this editor can recompute, and
 * all of them are things it must not throw away.
 *
 * `had` is what makes this fire on a *change* only, and the qualifier is what
 * makes it fire on an *unaccounted-for* change: a creature that loads already
 * carrying a shield its class already credits is left alone, and so is one
 * whose author has said, by writing the parentheses themselves, that the number
 * on the block already covers it.
 */
export function shieldChange(
  { value, type }: ArmorClass,
  had: boolean,
  has: boolean,
): ArmorClass | null {
  if (had === has) return null;
  const stated = names(type, SHIELD.qualifier);
  if (has && !stated) {
    return { value: value + SHIELD.bonus, type: withHintPart(type, SHIELD.qualifier) };
  }
  if (!has && stated) {
    return { value: value - SHIELD.bonus, type: withoutHintPart(type, SHIELD.qualifier) };
  }
  return null;
}
