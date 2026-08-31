/**
 * The 5e skill list and its governing abilities.
 *
 * D&D Beyond stores a skill's *final* bonus as a typed-in number, so its form
 * makes the user do the arithmetic. We don't have to: a proficient skill is
 * `ability modifier + proficiency bonus`, and both are already in the model.
 * That's what `skillBonus` computes, and what the editor writes back when a
 * skill is added.
 *
 * Rules knowledge only — the numeric ids DDB uses for these skills live in the
 * adapter, with the rest of its DOM knowledge.
 */
import type { Ability, Monster } from "./model.js";
import { abilityModifier, proficiencyBonus } from "./compute.js";

/** Skill name → the ability whose modifier it uses. */
export const SKILL_ABILITY: Record<string, Ability> = {
  Athletics: "str",
  Acrobatics: "dex",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Arcana: "int",
  History: "int",
  Investigation: "int",
  Nature: "int",
  Religion: "int",
  "Animal Handling": "wis",
  Insight: "wis",
  Medicine: "wis",
  Perception: "wis",
  Survival: "wis",
  Deception: "cha",
  Intimidation: "cha",
  Performance: "cha",
  Persuasion: "cha",
};

/**
 * The bonus a proficient creature has in `skill`, or undefined for a skill
 * outside the standard list (DDB could add one) so callers can fall back to
 * whatever the form already holds.
 */
export function skillBonus(monster: Monster, skill: string): number | undefined {
  const ability = SKILL_ABILITY[skill];
  if (!ability) return undefined;
  return abilityModifier(monster.abilities[ability]) + proficiencyBonus(monster);
}
