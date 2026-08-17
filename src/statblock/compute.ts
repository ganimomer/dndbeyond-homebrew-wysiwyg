/** Derived stat-block math: ability modifiers, proficiency, CR → XP. */
import type { Ability, Monster } from "./model.js";

/** D&D 5e ability modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Saving-throw bonus for an ability. A recorded value in `savingThrows` means
 * the creature is proficient; otherwise the save equals the ability modifier
 * (the 2024 stat block shows a Save column for every ability).
 */
export function saveBonus(monster: Monster, ability: Ability): number {
  const recorded = monster.savingThrows[ability];
  if (recorded !== undefined) return recorded;
  return abilityModifier(monster.abilities[ability]);
}

/** Initiative shown on the 2024 AC line; defaults to the Dexterity modifier. */
export function initiativeText(monster: Monster): string {
  if (monster.initiative) return monster.initiative;
  return formatModifier(abilityModifier(monster.abilities.dex));
}

/** The size/type/alignment line, honoring an explicit override. */
export function metaLine(monster: Monster): string {
  if (monster.metaOverride) return monster.metaOverride;
  const typeLine = [monster.size, monster.type].filter(Boolean).join(" ");
  return `${typeLine}${monster.alignment ? `, ${monster.alignment}` : ""}`;
}

/** Formats a modifier with an explicit sign, e.g. 3 → "+3", -1 → "−1". */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** Proficiency bonus by challenge rating (5e DMG table). */
export function proficiencyForCr(cr: string): number {
  const value = parseChallengeRating(cr);
  if (value < 5) return 2;
  return Math.floor((value - 1) / 4) + 2;
}

/** Effective proficiency bonus, honoring an explicit override. */
export function proficiencyBonus(monster: Monster): number {
  return monster.proficiencyBonus ?? proficiencyForCr(monster.challengeRating);
}

/** Parses "1/2", "1/4", "1/8" and integers into a numeric CR. */
export function parseChallengeRating(cr: string): number {
  const trimmed = cr.trim();
  if (trimmed.includes("/")) {
    const [n, d] = trimmed.split("/").map((s) => Number(s.trim()));
    if (d) return n / d;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

const XP_BY_CR: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};

/** XP award for a challenge rating, or undefined if off-table. */
export function xpForCr(cr: string): number | undefined {
  return XP_BY_CR[cr.trim()];
}
