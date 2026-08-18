/**
 * A browser-agnostic model of a D&D 5e monster stat block.
 *
 * This is the single source of truth the editor mutates and the preview
 * renders. The page adapter's job is to translate between this model and
 * whatever shape D&D Beyond's form actually stores.
 */

/** Which D&D Beyond stat-block layout a monster is authored/rendered under. */
export type Ruleset = "5e" | "5.5e";

/** A description section of the stat block. */
export type SectionKey =
  | "traits"
  | "actions"
  | "bonusActions"
  | "reactions"
  | "characteristics"
  | "legendary"
  | "mythic"
  | "lair";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: readonly Ability[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

/**
 * The standard 5e sizes, kept as a documented hint. The model's `size` is a
 * free-form string, because D&D Beyond's size can be free text (e.g. 5.5e's
 * "Medium or Small") that no fixed enum can hold.
 */
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
  /** Layout to render under. Defaults to 5.5e; the page adapter sets it. */
  ruleset: Ruleset;

  name: string;
  /** Optional creature artwork URL, shown atop the full-page stat block. */
  image?: string;
  /** Free-form size display, e.g. "Medium" or 5.5e's "Medium or Small". */
  size: string;
  /** Base creature type, e.g. "humanoid" or "Undead". */
  type: string;
  /**
   * Subtype tags, shown parenthetically after the type ("humanoid (elf)"). DDB's
   * sub-type is a multi-select, so this is a list (usually empty or one entry).
   */
  subTypes: string[];
  alignment: string;

  /** Free text so we can preserve the parenthetical, e.g. "15 (natural armor)". */
  armorClass: string;
  /**
   * 5.5e only: the Initiative value shown beside AC, e.g. "+14 (24)". When
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
  /** 5.5e only: carried equipment shown as a "Gear" tidbit. */
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

  /**
   * Ready-to-render HTML for description sections, keyed by section. Populated
   * when reading from D&D Beyond's editor (its bodies are already HTML); the
   * renderers prefer this over the structured `NamedEntry[]` arrays above,
   * which samples still use.
   */
  descriptionHtml?: Partial<Record<SectionKey, string>>;
}

/** A blank monster with sane defaults, safe to render immediately. */
export function emptyMonster(): Monster {
  return {
    ruleset: "5.5e",
    name: "New Creature",
    size: "Medium",
    type: "humanoid",
    subTypes: [],
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
