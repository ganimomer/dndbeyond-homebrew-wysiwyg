/**
 * D&D Beyond keeps all three damage adjustments in one multi-select whose
 * options read "Acid - Resistance". Reading the form and writing back to it both
 * depend on splitting that label the same way, so the split lives here rather
 * than in either of them.
 */

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
