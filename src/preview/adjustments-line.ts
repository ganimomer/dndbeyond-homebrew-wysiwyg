/**
 * The damage-adjustment and condition-immunity rows: a removable chip per
 * value, then a "+" the editor turns into a menu of the ones not yet taken
 * (`wireAdjustments`). Shared by both renderers.
 *
 * D&D Beyond keeps all three damage adjustments in *one* multi-select whose
 * options read "Acid - Resistance", and condition immunities in a second. So a
 * chip records which list it came from: the 5.5e "Immunities" row prints damage
 * and condition immunities together, and its chips are drawn from both.
 */
import type { Monster } from "../statblock/model.js";
import { el } from "./dom.js";
import { addButton, chip } from "./tags.js";

/** Which of DDB's two multi-selects a chip's value belongs to. */
export type AdjustmentSource = "damage" | "condition";

/** The rows this module renders, named for the field (or merged row) they show. */
export type AdjustmentField =
  | "damageVulnerabilities"
  | "damageResistances"
  | "damageImmunities"
  | "conditionImmunities"
  | "immunities";

interface Group {
  source: AdjustmentSource;
  values: string[];
}

/** The groups each row draws its chips from, in print order. */
function groupsFor(monster: Monster, field: AdjustmentField): Group[] {
  switch (field) {
    case "damageVulnerabilities":
      return [{ source: "damage", values: monster.damageVulnerabilities }];
    case "damageResistances":
      return [{ source: "damage", values: monster.damageResistances }];
    case "damageImmunities":
      return [{ source: "damage", values: monster.damageImmunities }];
    case "conditionImmunities":
      return [{ source: "condition", values: monster.conditionImmunities }];
    // 5.5e prints damage and condition immunities as one "Immunities" line.
    case "immunities":
      return [
        { source: "damage", values: monster.damageImmunities },
        { source: "condition", values: monster.conditionImmunities },
      ];
  }
}

/** True when the row has anything to print (so it isn't rendered when empty). */
export function hasAdjustments(monster: Monster, field: AdjustmentField): boolean {
  return groupsFor(monster, field).some((group) => group.values.length > 0);
}

export function adjustmentChips(monster: Monster, field: AdjustmentField, addLabel: string): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = field;

  for (const group of groupsFor(monster, field)) {
    for (const value of group.values) {
      const tag = chip({ value, label: value });
      // Which select to write the removal back to — the merged 5.5e row can
      // hold chips from either.
      tag.dataset.source = group.source;
      wrap.append(tag);
    }
  }

  const menuHost = el("span", "sb-chip-menu");
  menuHost.append(addButton(addLabel));
  wrap.append(menuHost);
  return wrap;
}
