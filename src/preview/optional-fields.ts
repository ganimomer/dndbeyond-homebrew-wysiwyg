/**
 * Which parts of the basics section are optional, and what each one renders.
 *
 * A real stat block prints only the rows a creature actually has, so a field
 * with no value isn't rendered — there's no placeholder row and no stray "+".
 * The "Add…" menu at the foot of the section brings one back: revealing a field
 * is session state (`revealed`), and the moment the user gives it a value it
 * renders on its own merit and the reveal stops mattering.
 *
 * One table drives both the renderers and that menu, so the two can't drift.
 */
import type { Monster, Ruleset } from "../statblock/model.js";
import { metaSlot, subTypeEditor } from "./meta.js";
import { skillsChips } from "./skills-line.js";
import { savingThrowChips } from "./saves-line.js";
import { adjustmentChips, hasAdjustments, type AdjustmentField } from "./adjustments-line.js";
import { hasSenses, senseChips } from "./senses-line.js";
import { island } from "./island.js";

export type OptionalField =
  | "size"
  | "type"
  | "subTypes"
  | "alignment"
  | "savingThrows"
  | "skills"
  | "damageVulnerabilities"
  | "damageResistances"
  | "immunities"
  | "damageImmunities"
  | "conditionImmunities"
  | "gear"
  | "senses"
  | "languages";

export interface FieldSpec {
  key: OptionalField;
  /** Where it sits: inline in the meta sentence, or as its own labelled row. */
  slot: "meta" | "tidbit";
  /** The row's label. Meta slots have none — they read as a sentence. */
  label?: string;
  /** What the "Add…" menu calls it. */
  menuLabel: string;
  /** `data-dep` for the row, when its value is derived from ability scores. */
  dep?: string;
  /**
   * The control to land in when this field is revealed: a `data-focus-key` on an
   * input, or on the trigger of the picker the panel should open (see
   * `EditorPanel.render`). Every field has one — adding a row is always a
   * prelude to filling it in.
   */
  focusKey: string;
  /** True when the creature has a value, i.e. the row renders unprompted. */
  hasValue(monster: Monster): boolean;
  /** The row's value (or, for a revealed-but-empty field, its empty form). */
  render(monster: Monster): Node;
}

/** Options rendered by both layouts, in meta-sentence order. */
const META: FieldSpec[] = [
  {
    key: "size",
    slot: "meta",
    focusKey: "meta:size",
    menuLabel: "Size",
    hasValue: (m) => m.size !== "",
    render: (m) => metaSlot("size", m.size || "Size…", !m.size),
  },
  {
    key: "type",
    slot: "meta",
    focusKey: "meta:type",
    menuLabel: "Creature type",
    hasValue: (m) => m.type !== "",
    render: (m) => metaSlot("type", m.type || "Type…", !m.type),
  },
  {
    key: "subTypes",
    slot: "meta",
    focusKey: "meta:subTypes",
    menuLabel: "Subtype",
    hasValue: (m) => m.subTypes.length > 0,
    render: (m) => subTypeEditor(m.subTypes),
  },
  {
    key: "alignment",
    slot: "meta",
    focusKey: "meta:alignment",
    menuLabel: "Alignment",
    hasValue: (m) => m.alignment !== "",
    render: (m) => metaSlot("alignment", m.alignment || "Alignment…", !m.alignment),
  },
];

/** A chip row over one of DDB's adjustment multi-selects. */
function adjustments(
  key: AdjustmentField & OptionalField,
  label: string,
  menuLabel: string,
): FieldSpec {
  return {
    key,
    slot: "tidbit",
    label,
    menuLabel,
    focusKey: `add:${key}`,
    hasValue: (m) => hasAdjustments(m, key),
    render: (m) => adjustmentChips(m, key, `Add ${menuLabel.toLowerCase()}`),
  };
}

const SKILLS: FieldSpec = {
  key: "skills",
  slot: "tidbit",
  focusKey: "add:skills",
  label: "Skills",
  menuLabel: "Skills",
  // Every skill bonus moves with its governing ability score.
  dep: "all",
  hasValue: (m) => Object.keys(m.skills).length > 0,
  render: (m) => skillsChips(m),
};

const SENSES: FieldSpec = {
  key: "senses",
  slot: "tidbit",
  focusKey: "add:senses",
  label: "Senses",
  menuLabel: "Senses",
  hasValue: hasSenses,
  render: (m) => senseChips(m),
};

const LANGUAGES: FieldSpec = {
  key: "languages",
  slot: "tidbit",
  focusKey: "text:languages",
  label: "Languages",
  menuLabel: "Languages",
  hasValue: (m) => m.languages !== "",
  // A component now: the registry only says where it goes (see island.ts).
  render: () => island("languages"),
};

const GEAR: FieldSpec = {
  key: "gear",
  slot: "tidbit",
  focusKey: "text:gear",
  label: "Gear",
  menuLabel: "Gear",
  hasValue: (m) => m.gear !== "",
  render: () => island("gear"),
};

/** 5.5e tidbits, in the order the 2024 stat block prints them. */
const TIDBITS_55E: FieldSpec[] = [
  SKILLS,
  adjustments("damageVulnerabilities", "Vulnerabilities", "Vulnerabilities"),
  adjustments("damageResistances", "Resistances", "Resistances"),
  // One row for both immunity kinds, the way the 2024 block prints them.
  adjustments("immunities", "Immunities", "Immunities"),
  GEAR,
  SENSES,
  LANGUAGES,
];

/** 5e tidbits: the same fields under the 2014 block's longer labels. */
const TIDBITS_5E: FieldSpec[] = [
  {
    key: "savingThrows",
    slot: "tidbit",
    focusKey: "add:savingThrows",
    label: "Saving Throws",
    menuLabel: "Saving Throws",
    // 5.5e has no such row: it prints all six saves in the ability tables.
    hasValue: (m) => Object.keys(m.savingThrows).length > 0,
    render: (m) => savingThrowChips(m),
  },
  SKILLS,
  adjustments("damageVulnerabilities", "Damage Vulnerabilities", "Damage Vulnerabilities"),
  adjustments("damageResistances", "Damage Resistances", "Damage Resistances"),
  adjustments("damageImmunities", "Damage Immunities", "Damage Immunities"),
  adjustments("conditionImmunities", "Condition Immunities", "Condition Immunities"),
  SENSES,
  LANGUAGES,
];

/** The optional tidbit rows of a layout, in print order. */
export function tidbitFields(ruleset: Ruleset): FieldSpec[] {
  return ruleset === "5e" ? TIDBITS_5E : TIDBITS_55E;
}

/** The optional meta-sentence slots, in print order. */
export function metaFields(): FieldSpec[] {
  return META;
}

/** Everything optional in the basics section, meta slots first. */
export function basicsFields(ruleset: Ruleset): FieldSpec[] {
  return [...META, ...tidbitFields(ruleset)];
}

/** What the renderers hand the preview: the fields revealed this session. */
export interface RenderOptions {
  /**
   * Optional fields the user added from the "Add…" menu that have no value yet.
   * Session state held by the panel — nothing about it is written to D&D Beyond.
   */
  revealed?: ReadonlySet<OptionalField>;
}

export function isVisible(
  spec: FieldSpec,
  monster: Monster,
  revealed: ReadonlySet<OptionalField> = new Set(),
): boolean {
  return spec.hasValue(monster) || revealed.has(spec.key);
}

/** The keys of the meta slots that should render — what `metaContent` takes. */
export function visibleMeta(
  monster: Monster,
  revealed?: ReadonlySet<OptionalField>,
): Set<OptionalField> {
  return new Set(META.filter((spec) => isVisible(spec, monster, revealed)).map((s) => s.key));
}

/** The fields the "Add…" menu offers: everything not currently on the block. */
export function hiddenFields(
  monster: Monster,
  revealed: ReadonlySet<OptionalField> | undefined,
  ruleset: Ruleset,
): FieldSpec[] {
  return basicsFields(ruleset).filter((spec) => !isVisible(spec, monster, revealed));
}
