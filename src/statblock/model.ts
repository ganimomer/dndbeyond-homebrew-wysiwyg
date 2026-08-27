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

/** The uppercase abbreviation both layouts label an ability with. */
export const ABILITY_ABBREV: Record<Ability, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

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

/** One row of D&D Beyond's movement table. */
export interface Movement {
  /** Display name as DDB lists it: "Walk", "Burrow", "Climb", "Fly", "Swim". */
  type: string;
  /** Speed in feet. */
  speed: number;
  /**
   * DDB's free-text note, e.g. "hover". Rendered but not editable here — and
   * always posted back on an edit, so it can't be lost.
   */
  note?: string;
}

/**
 * Armor class as D&D Beyond stores it: a number plus a free-text qualifier.
 * The split into "unarmored + armor" that the editor shows is derived, not
 * stored — see statblock/armor-class.ts.
 */
export interface ArmorClass {
  value: number;
  /** DDB's qualifier, e.g. "natural armor". Often empty. */
  type: string;
}

/**
 * Hit points as D&D Beyond stores them: four separate controls, not a sentence.
 * The average is kept rather than derived because DDB's field is the author's
 * to set — plenty of stat blocks carry a deliberately hand-tuned number.
 */
export interface HitPoints {
  /** The printed average, e.g. the 195 in "195 (23d8 + 92)". */
  average: number;
  dieCount: number;
  /** Die faces: 4, 6, 8, 10, 12 or 20. Zero when the creature has no dice. */
  dieValue: number;
  modifier: number;
}

/**
 * One row of D&D Beyond's sense table: a sense and its free-text qualifier.
 * DDB keeps the qualifier as text ("120 ft."), not a number, so we do too.
 */
export interface Sense {
  /** Display name as DDB lists it: "Blindsight", "Darkvision", "Tremorsense". */
  type: string;
  /** DDB's note, e.g. "120 ft." or "60 ft. (blind beyond this radius)". */
  note: string;
}

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

  /** The number and its parenthetical, e.g. 15 "(natural armor)". */
  armorClass: ArmorClass;
  /**
   * 5.5e only: the Initiative value shown beside AC, e.g. "+14 (24)". When
   * omitted the preview derives it from the Dexterity modifier.
   */
  initiative?: string;
  /** The four numbers behind "45 (6d8 + 18)" (see statblock/hit-points.ts). */
  hitPoints: HitPoints;
  /** One entry per movement type, Walk first (see statblock/movement.ts). */
  movements: Movement[];

  abilities: AbilityScores;

  savingThrows: Partial<Record<Ability, number>>;
  skills: Record<string, number>;

  /**
   * The three damage adjustments. DDB stores all of them in one multi-select
   * whose options read "Acid - Resistance", so they're lists of damage-type
   * names here rather than one prose string (see the adapter).
   */
  damageVulnerabilities: string[];
  damageResistances: string[];
  damageImmunities: string[];
  /** DDB's own multi-select, separate from the damage adjustments above. */
  conditionImmunities: string[];
  /** 5.5e only: carried equipment shown as a "Gear" tidbit. A plain DDB input. */
  gear: string;
  /** One entry per sense row; passive Perception is its own field below. */
  senses: Sense[];
  /** The passive Perception printed at the end of the Senses line. */
  passivePerception?: number;
  /** DDB's free-text languages note, e.g. "Common plus two other languages". */
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
   * Whether the creature is legendary — D&D Beyond's "Is Legendary?" checkbox.
   *
   * It is a property of the creature rather than of the Legendary Actions
   * section because DDB treats it as one: the section's text is only read back,
   * and only kept on save, while this is ticked.
   */
  isLegendary?: boolean;
  /**
   * Whether the creature has a lair — D&D Beyond's "Has Lair?" checkbox, and
   * the same kind of gate as `isLegendary` above: Lair Actions are only read
   * back, and only kept on save, while this is ticked.
   */
  hasLair?: boolean;
  /**
   * Whether the creature is mythic — the third of D&D Beyond's gate checkboxes,
   * over the Mythic Actions textarea. Nothing on the block offers to tick it,
   * because a mythic creature is rare enough that nobody reaches for one by
   * accident; importing a mythic action from another creature is the one
   * gesture that implies it, and does it.
   */
  isMythic?: boolean;

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
    armorClass: { value: 10, type: "" },
    hitPoints: { average: 1, dieCount: 1, dieValue: 4, modifier: -1 },
    movements: [],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: {},
    skills: {},
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    gear: "",
    senses: [],
    languages: "",
    challengeRating: "0",
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
  };
}
