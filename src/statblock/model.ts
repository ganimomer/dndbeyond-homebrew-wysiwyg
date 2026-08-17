/**
 * A browser-agnostic model of a D&D 5e monster stat block.
 *
 * This is the single source of truth the editor mutates and the preview
 * renders. The page adapter's job is to translate between this model and
 * whatever shape D&D Beyond's form actually stores.
 */

/** Which D&D Beyond stat-block layout a monster is authored/rendered under. */
export type Ruleset = "2014" | "2024";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: readonly Ability[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

export type Size =
  | "Tiny"
  | "Small"
  | "Medium"
  | "Large"
  | "Huge"
  | "Gargantuan";

export type AbilityScores = Record<Ability, number>;

/** A named block of prose: traits, actions, reactions, etc. */
export interface NamedEntry {
  name: string;
  /** Body text. May contain lightweight inline markup we expand on render. */
  text: string;
}

export interface Monster {
  /** Layout to render under. Defaults to 2024; the page adapter sets it. */
  ruleset: Ruleset;

  name: string;
  size: Size;
  /** e.g. "humanoid (elf)" */
  type: string;
  alignment: string;
  /**
   * Optional exact meta line, used when size/type/alignment don't compose
   * cleanly (e.g. 2024's "Medium or Small Undead, Lawful Evil"). When unset the
   * renderers build the line from size + type + alignment.
   */
  metaOverride?: string;

  /** Free text so we can preserve the parenthetical, e.g. "15 (natural armor)". */
  armorClass: string;
  /**
   * 2024 only: the Initiative value shown beside AC, e.g. "+14 (24)". When
   * omitted the preview derives it from the Dexterity modifier.
   */
  initiative?: string;
  /** Free text, e.g. "45 (6d8 + 18)". */
  hitPoints: string;
  /** Free text, e.g. "30 ft., fly 60 ft.". */
  speed: string;

  abilities: AbilityScores;

  savingThrows: Partial<Record<Ability, number>>;
  skills: Record<string, number>;

  damageVulnerabilities: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  /** 2024 only: carried equipment shown as a "Gear" tidbit. */
  gear: string;
  senses: string;
  languages: string;

  /** Challenge rating as authored, e.g. "3" or "1/2". */
  challengeRating: string;
  /** Optional explicit proficiency bonus; derived from CR when omitted. */
  proficiencyBonus?: number;

  traits: NamedEntry[];
  actions: NamedEntry[];
  bonusActions: NamedEntry[];
  reactions: NamedEntry[];
  legendaryActions: NamedEntry[];
  /** Preamble shown above the legendary action list ("The X can take 3…"). */
  legendaryActionsIntro?: string;
}

/** A blank monster with sane defaults, safe to render immediately. */
export function emptyMonster(): Monster {
  return {
    ruleset: "2024",
    name: "New Creature",
    size: "Medium",
    type: "humanoid",
    alignment: "unaligned",
    armorClass: "10",
    hitPoints: "1 (1d4 - 1)",
    speed: "30 ft.",
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: {},
    skills: {},
    damageVulnerabilities: "",
    damageResistances: "",
    damageImmunities: "",
    conditionImmunities: "",
    gear: "",
    senses: "passive Perception 10",
    languages: "—",
    challengeRating: "0",
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
  };
}
