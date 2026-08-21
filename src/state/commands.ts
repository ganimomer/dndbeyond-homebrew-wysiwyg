/**
 * The edits, one constructor each.
 *
 * Every one captures what it is replacing at the moment it is built, so it can
 * put it back. That is the whole reason these are constructors taking the
 * current creature rather than plain calls on the adapter.
 *
 * Two shapes cover nearly all of them:
 *
 *   - `field` — a value goes into one of D&D Beyond's form controls, and the old
 *     value goes back on undo. Autosave persists it.
 *   - `listing` — a skill, movement or sense, which DDB keeps as its own record
 *     behind its own endpoint. Applying is a request and so is undoing, so the
 *     inverse is spelled out rather than derived.
 *
 * A few of the form controls are `<select>`s whose values are DDB's numeric
 * codes, and the model only carries the label. For those the previous value is
 * read back off the options themselves — see `chosen`/`chosenMany`.
 */
import type { PageAdapter, SelectOption } from "../adapter/types.js";
import {
  ABILITY_ABBREV,
  type Ability,
  type ArmorClass,
  type HitPoints,
  type Monster,
  type Ruleset,
  type SectionKey,
} from "../statblock/model.js";
// The default spinner location. It belongs beside the save machinery, which
// moves under `state/` when autosave does.
import { HEADER_ORIGIN } from "../editor/save-indicator.js";
import type { Command } from "./command.js";

/** An edit to a form field: autosave persists it, and undo writes the old value. */
function field<T>(spec: {
  label: string;
  origin?: string;
  mergeKey?: string;
  from: T;
  to: T;
  write(adapter: PageAdapter, value: T): void;
}): Command {
  return {
    label: spec.label,
    origin: spec.origin ?? HEADER_ORIGIN,
    persist: "autosave",
    mergeKey: spec.mergeKey,
    apply: (adapter) => spec.write(adapter, spec.to),
    revert: (adapter) => spec.write(adapter, spec.from),
  };
}

/** An edit to one of DDB's separate records: a request out, a request back. */
function listing(spec: {
  label: string;
  apply(adapter: PageAdapter): Promise<void>;
  revert(adapter: PageAdapter): Promise<void>;
}): Command {
  return { ...spec, origin: HEADER_ORIGIN, persist: "self" };
}

/** The option value a `<select>` currently holds. */
const chosen = (options: SelectOption[]): string =>
  options.find((option) => option.selected)?.value ?? "";

/** The option values a multi-select currently holds. */
const chosenMany = (options: SelectOption[]): string[] =>
  options.filter((option) => option.selected).map((option) => option.value);

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export const setRuleset = (monster: Monster, ruleset: Ruleset): Command =>
  field({
    label: `${ruleset} stat block`,
    from: monster.ruleset,
    to: ruleset,
    write: (adapter, value) => adapter.setRuleset(value),
  });

export const setLegendary = (monster: Monster, on: boolean): Command =>
  field({
    label: on ? "Legendary" : "Not legendary",
    from: !!monster.isLegendary,
    to: on,
    write: (adapter, value) => adapter.setLegendary(value),
  });

export const setHasLair = (monster: Monster, on: boolean): Command =>
  field({
    label: on ? "Lair" : "No lair",
    from: !!monster.hasLair,
    to: on,
    write: (adapter, value) => adapter.setHasLair(value),
  });

export const setAbility = (monster: Monster, ability: Ability, score: number): Command =>
  field({
    label: `${ABILITY_ABBREV[ability]} ${score}`,
    from: monster.abilities[ability],
    to: score,
    write: (adapter, value) => adapter.setAbility(ability, value),
  });

export const setArmorClass = (monster: Monster, armorClass: ArmorClass): Command =>
  field({
    label: `AC ${armorClass.value}`,
    from: monster.armorClass,
    to: armorClass,
    write: (adapter, value) => adapter.setArmorClass(value),
  });

export const setHitPoints = (monster: Monster, hitPoints: HitPoints): Command =>
  field({
    label: `HP ${hitPoints.average}`,
    from: monster.hitPoints,
    to: hitPoints,
    write: (adapter, value) => adapter.setHitPoints(value),
  });

export const setName = (monster: Monster, name: string): Command =>
  field({
    label: `Name “${name}”`,
    from: monster.name,
    to: name,
    // Renaming commits on blur, but merge anyway: two edits to a name in a row
    // are one thing the user did.
    mergeKey: "name",
    write: (adapter, value) => adapter.setName(value),
  });

export const setGear = (monster: Monster, text: string): Command =>
  field({
    label: text ? "Gear" : "Remove gear",
    from: monster.gear,
    to: text,
    mergeKey: "gear",
    write: (adapter, value) => adapter.setGear(value),
  });

export const setLanguages = (monster: Monster, text: string): Command =>
  field({
    label: text ? "Languages" : "Remove languages",
    from: monster.languages,
    to: text,
    mergeKey: "languages",
    write: (adapter, value) => adapter.setLanguages(value),
  });

export const setPassivePerception = (monster: Monster, value: number): Command =>
  field({
    label: `Passive Perception ${value}`,
    from: monster.passivePerception ?? 0,
    to: value,
    mergeKey: "passivePerception",
    write: (adapter, next) => adapter.setPassivePerception(next),
  });

export const setDescription = (monster: Monster, section: SectionKey, html: string): Command =>
  field({
    label: "Edit text",
    // The spinner belongs on the section being written, not the header.
    origin: section,
    from: monster.descriptionHtml?.[section] ?? "",
    to: html,
    // Prose commits every few hundred milliseconds while typing; without this a
    // paragraph would be hundreds of undo steps.
    mergeKey: `description:${section}`,
    write: (adapter, value) => adapter.setDescription(section, value),
  });

export const setSize = (options: SelectOption[], value: string): Command =>
  field({
    label: "Size",
    from: chosen(options),
    to: value,
    write: (adapter, next) => adapter.setSize(next),
  });

export const setType = (options: SelectOption[], value: string): Command =>
  field({
    label: "Creature type",
    from: chosen(options),
    to: value,
    write: (adapter, next) => adapter.setType(next),
  });

export const setAlignment = (options: SelectOption[], value: string): Command =>
  field({
    label: "Alignment",
    from: chosen(options),
    to: value,
    write: (adapter, next) => adapter.setAlignment(next),
  });

export const setSubTypes = (options: SelectOption[], values: string[]): Command =>
  field({
    label: "Subtype",
    from: chosenMany(options),
    to: values,
    write: (adapter, next) => adapter.setSubTypes(next),
  });

export const setSavingThrows = (options: SelectOption[], values: string[]): Command =>
  field({
    label: "Saving throws",
    from: chosenMany(options),
    to: values,
    write: (adapter, next) => adapter.setSavingThrows(next),
  });

export const setDamageAdjustments = (options: SelectOption[], values: string[]): Command =>
  field({
    label: "Damage adjustments",
    from: chosenMany(options),
    to: values,
    write: (adapter, next) => adapter.setDamageAdjustments(next),
  });

export const setConditionImmunities = (options: SelectOption[], values: string[]): Command =>
  field({
    label: "Condition immunities",
    from: chosenMany(options),
    to: values,
    write: (adapter, next) => adapter.setConditionImmunities(next),
  });

// ---------------------------------------------------------------------------
// Listing records — skills, movements, senses
// ---------------------------------------------------------------------------

export const addSkill = (name: string, value: string, bonus: number): Command =>
  listing({
    label: `Add ${name}`,
    apply: (adapter) => adapter.addSkill(value, bonus),
    revert: (adapter) => adapter.removeSkill(name),
  });

export const removeSkill = (name: string, value: string, bonus: number): Command =>
  listing({
    label: `Remove ${name}`,
    apply: (adapter) => adapter.removeSkill(name),
    revert: (adapter) => adapter.addSkill(value, bonus),
  });

export const addMovement = (type: string, value: string, speed: number): Command =>
  listing({
    label: `Add ${type} speed`,
    apply: (adapter) => adapter.addMovement(value, speed),
    revert: (adapter) => adapter.removeMovement(type),
  });

export const setMovementSpeed = (type: string, from: number, to: number): Command =>
  listing({
    label: `${type} ${to} ft.`,
    apply: (adapter) => adapter.setMovementSpeed(type, to),
    revert: (adapter) => adapter.setMovementSpeed(type, from),
  });

export const removeMovement = (type: string, value: string, speed: number): Command =>
  listing({
    label: `Remove ${type} speed`,
    apply: (adapter) => adapter.removeMovement(type),
    revert: (adapter) => adapter.addMovement(value, speed),
  });

export const addSense = (type: string, value: string, note: string): Command =>
  listing({
    label: `Add ${type}`,
    apply: (adapter) => adapter.addSense(value, note),
    revert: (adapter) => adapter.removeSense(type),
  });

export const setSenseNote = (type: string, from: string, to: string): Command =>
  listing({
    label: `${type} ${to}`,
    apply: (adapter) => adapter.setSenseNote(type, to),
    revert: (adapter) => adapter.setSenseNote(type, from),
  });

export const removeSense = (type: string, value: string, note: string): Command =>
  listing({
    label: `Remove ${type}`,
    apply: (adapter) => adapter.removeSense(type),
    revert: (adapter) => adapter.addSense(value, note),
  });
