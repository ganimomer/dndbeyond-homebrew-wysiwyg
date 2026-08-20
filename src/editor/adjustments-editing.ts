/**
 * Makes the damage-adjustment and condition-immunity rows editable: a ✕ per
 * value and a "+" menu of the ones the creature hasn't got.
 *
 * Both are ordinary multi-selects on D&D Beyond's form, so every edit rewrites
 * the whole chosen set and rides autosave — no per-row round-trip like skills.
 * The wrinkle is that DDB packs all three damage adjustments into *one* select
 * ("Acid - Resistance"), so a row has to commit the values of the two kinds it
 * *isn't* showing untouched alongside its own.
 */
import type { SelectOption } from "../adapter/types.js";
import type { AdjustmentField } from "../preview/adjustments-line.js";
import { parseAdjustment, type AdjustmentKind } from "../statblock/adjustments.js";
import { OptionPicker } from "./option-picker.js";

/** The adapter surface these rows need (satisfied by PageAdapter). */
export interface AdjustmentsAdapter {
  damageAdjustmentOptions(): SelectOption[];
  setDamageAdjustments(values: string[]): void;
  conditionImmunityOptions(): SelectOption[];
  setConditionImmunities(values: string[]): void;
}

/** What each row draws from: a damage kind, the condition list, or both. */
const ROWS: Record<AdjustmentField, { damage?: AdjustmentKind; condition?: boolean }> = {
  damageVulnerabilities: { damage: "vulnerability" },
  damageResistances: { damage: "resistance" },
  damageImmunities: { damage: "immunity" },
  conditionImmunities: { condition: true },
  // 5.5e prints damage and condition immunities as one row.
  immunities: { damage: "immunity", condition: true },
};

/**
 * Wires every adjustment row present in `scope`. What's chosen comes from the
 * form's own selects rather than the model, since that's what a commit has to
 * rewrite wholesale.
 */
export function wireAdjustments(
  scope: ParentNode,
  adapter: AdjustmentsAdapter,
  onCommit: () => void,
): OptionPicker[] {
  const menus: OptionPicker[] = [];
  for (const field of Object.keys(ROWS) as AdjustmentField[]) {
    const wrap = scope.querySelector<HTMLElement>(`.sb-chips[data-field="${field}"]`);
    if (wrap) menus.push(...wireRow(wrap, field, adapter, onCommit));
  }
  return menus;
}

function wireRow(
  wrap: HTMLElement,
  field: AdjustmentField,
  adapter: AdjustmentsAdapter,
  onCommit: () => void,
): OptionPicker[] {
  const row = ROWS[field];
  const damageOptions = adapter.damageAdjustmentOptions();
  const conditionOptions = adapter.conditionImmunityOptions();
  const chosen = {
    damage: damageOptions.filter((o) => o.selected).map((o) => o.value),
    condition: conditionOptions.filter((o) => o.selected).map((o) => o.value),
  };

  /** The damage options this row is responsible for, by damage-type name. */
  const damageByName = new Map(
    damageOptions
      .filter((o) => row.damage && parseAdjustment(o.text).kind === row.damage)
      .map((o) => [parseAdjustment(o.text).name, o]),
  );
  const conditionByName = new Map(conditionOptions.map((o) => [o.text, o]));

  const commitDamage = (values: string[]) => {
    adapter.setDamageAdjustments(values);
    onCommit();
  };
  const commitCondition = (values: string[]) => {
    adapter.setConditionImmunities(values);
    onCommit();
  };

  // Removing a chip commits the set without that value. The other two damage
  // kinds ride along in `chosen.damage` untouched, which is the whole point.
  for (const button of wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove")) {
    button.addEventListener("click", () => {
      const tag = button.closest<HTMLElement>(".sb-chip");
      const name = tag?.dataset.value ?? "";
      if (tag?.dataset.source === "condition") {
        const option = conditionByName.get(name);
        if (option) commitCondition(chosen.condition.filter((v) => v !== option.value));
        return;
      }
      const option = damageByName.get(name);
      if (option) commitDamage(chosen.damage.filter((v) => v !== option.value));
    });
  }

  const host = wrap.querySelector<HTMLElement>(".sb-chip-menu");
  if (!host) return [];

  const items = [
    ...(row.damage
      ? [...damageByName.values()]
          .filter((o) => !o.selected)
          .map((o) => ({
            label: parseAdjustment(o.text).name,
            onClick: () => commitDamage([...chosen.damage, o.value]),
          }))
      : []),
    ...(row.condition
      ? conditionOptions
          .filter((o) => !o.selected)
          .map((o) => ({
            label: o.text,
            onClick: () => commitCondition([...chosen.condition, o.value]),
          }))
      : []),
  ];

  if (!items.length) {
    // Nothing left to add — keep the chips, drop the affordance.
    host.remove();
    return [];
  }

  const menu = new OptionPicker(items, {
    trigger: { text: "+", ariaLabel: `Add to ${field}`, variant: "add" },
    focusKey: `add:${field}`,
  });
  host.replaceChildren(menu.element);
  return [menu];
}
