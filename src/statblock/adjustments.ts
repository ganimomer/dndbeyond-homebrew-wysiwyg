/**
 * D&D Beyond keeps all three damage adjustments in one multi-select whose
 * options read "Acid - Resistance", and condition immunities in a second.
 * Reading the form, writing back to it, and deciding which values a given row
 * prints all depend on the same two facts, so they live here rather than in any
 * one of them.
 */
import type { Monster } from "./model.js";

/** Which of the three damage adjustments an option confers. */
export type AdjustmentKind = "vulnerability" | "resistance" | "immunity";

/** Splits "Acid - Resistance" into the damage type and what it does. */
export function parseAdjustment(optionText: string): { name: string; kind: AdjustmentKind } {
  const [name = "", kind = ""] = optionText.split(" - ");
  const k = kind.toLowerCase();
  // Matched loosely: DDB's labels vary ("Immunity", "Immunities"), and anything
  // unrecognised is a resistance, which is what the list is mostly made of.
  return {
    name: name.trim(),
    kind: k.includes("immun") ? "immunity" : k.includes("vulner") ? "vulnerability" : "resistance",
  };
}

/** Which of DDB's two multi-selects a value belongs to. */
export type AdjustmentSource = "damage" | "condition";

/** The rows these values are printed in, named for the field (or merged row). */
export type AdjustmentField =
  | "damageVulnerabilities"
  | "damageResistances"
  | "damageImmunities"
  | "conditionImmunities"
  | "immunities";

export interface AdjustmentGroup {
  source: AdjustmentSource;
  values: string[];
}

/** The groups a row draws its values from, in print order. */
export function adjustmentGroups(monster: Monster, field: AdjustmentField): AdjustmentGroup[] {
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

/** What each row draws from: a damage kind, the condition list, or both. */
export const ADJUSTMENT_ROWS: Record<
  AdjustmentField,
  { damage?: AdjustmentKind; condition?: boolean }
> = {
  damageVulnerabilities: { damage: "vulnerability" },
  damageResistances: { damage: "resistance" },
  damageImmunities: { damage: "immunity" },
  conditionImmunities: { condition: true },
  immunities: { damage: "immunity", condition: true },
};

/** True when the row has anything to print (so it isn't rendered when empty). */
export function hasAdjustments(monster: Monster, field: AdjustmentField): boolean {
  return adjustmentGroups(monster, field).some((group) => group.values.length > 0);
}
