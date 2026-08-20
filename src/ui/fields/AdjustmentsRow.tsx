/**
 * The damage-adjustment and condition-immunity rows: a removable chip per
 * value, and a "＋" offering the ones the creature hasn't got.
 *
 * One component for all five rows, because they differ only in which values
 * they draw from — see `ADJUSTMENT_ROWS`. The wrinkle they share is D&D
 * Beyond's: all three damage adjustments live in *one* multi-select whose
 * options read "Acid - Resistance", so committing a row means writing the two
 * kinds it *isn't* showing back untouched alongside its own. That is why what
 * is chosen comes from the form's selects rather than from the model.
 *
 * The 5.5e "Immunities" row prints damage and condition immunities together, so
 * a chip has to remember which select it came from.
 */
import { useEffect, useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import type { Monster } from "../../statblock/model.js";
import {
  ADJUSTMENT_ROWS,
  adjustmentGroups,
  parseAdjustment,
  type AdjustmentField,
} from "../../statblock/adjustments.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";

/** The adapter surface these rows need (satisfied by PageAdapter). */
export interface AdjustmentsAdapter {
  damageAdjustmentOptions(): SelectOption[];
  setDamageAdjustments(values: string[]): void;
  conditionImmunityOptions(): SelectOption[];
  setConditionImmunities(values: string[]): void;
}

/** What the ＋ is called, for anyone who can't see which row it is in. */
const ADD_LABEL: Record<AdjustmentField, string> = {
  damageVulnerabilities: "Add damage vulnerability",
  damageResistances: "Add damage resistance",
  damageImmunities: "Add damage immunity",
  conditionImmunities: "Add condition immunity",
  immunities: "Add immunity",
};

export interface AdjustmentsRowProps {
  monster: Monster;
  field: AdjustmentField;
  adapter: AdjustmentsAdapter;
  autoOpen?: boolean;
}

export function AdjustmentsRow({ monster, field, adapter, autoOpen = false }: AdjustmentsRowProps) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const row = ADJUSTMENT_ROWS[field];
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

  // Removing commits the set without that value. The two damage kinds this row
  // isn't showing ride along in `chosen.damage` untouched, which is the point.
  const remove = (source: "damage" | "condition", name: string) => {
    if (source === "condition") {
      const option = conditionByName.get(name);
      if (option) adapter.setConditionImmunities(chosen.condition.filter((v) => v !== option.value));
      return;
    }
    const option = damageByName.get(name);
    if (option) adapter.setDamageAdjustments(chosen.damage.filter((v) => v !== option.value));
  };

  const items = [
    ...(row.damage
      ? [...damageByName.values()]
          .filter((o) => !o.selected)
          .map((o) => ({
            label: parseAdjustment(o.text).name,
            onClick: () => adapter.setDamageAdjustments([...chosen.damage, o.value]),
          }))
      : []),
    ...(row.condition
      ? conditionOptions
          .filter((o) => !o.selected)
          .map((o) => ({
            label: o.text,
            onClick: () => adapter.setConditionImmunities([...chosen.condition, o.value]),
          }))
      : []),
  ];

  return (
    <span class="sb-chips" data-field={field}>
      {adjustmentGroups(monster, field).flatMap((group) =>
        group.values.map((value) => (
          <Chip
            key={`${group.source}:${value}`}
            value={value}
            label={value}
            // Which select a removal writes back to — the merged 5.5e row can
            // hold chips from either.
            onRemove={() => remove(group.source, value)}
          />
        )),
      )}
      {/* Nothing left to add: keep the chips, drop the affordance. */}
      {items.length > 0 ? (
        <span class="sb-chip-menu">
          <OptionPicker
            options={items}
            trigger={{ text: "+", ariaLabel: ADD_LABEL[field], variant: "add" }}
            focusKey={`add:${field}`}
            open={open}
            onOpenChange={setOpen}
          />
        </span>
      ) : null}
    </span>
  );
}
