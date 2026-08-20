/**
 * The 5e layout's "Saving Throws" row: a removable chip per proficient save,
 * and a "＋" offering the abilities that aren't.
 *
 * The 5.5e layout has no such row — it prints all six saves in the ability
 * tables, where proficiency is a dot in the Save cell instead.
 */
import { useEffect, useState } from "preact/hooks";
import { ABILITIES, ABILITY_ABBREV, type Monster } from "../../statblock/model.js";
import { abilityModifier, formatModifier, proficiencyBonus, saveBonus } from "../../statblock/compute.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";
import { saveCommitter, type SavesAdapter } from "./saving-throws.js";

export interface SavingThrowsRowProps {
  monster: Monster;
  adapter: SavesAdapter;
  /** Open the menu on arrival — the row was just added to be filled in. */
  autoOpen?: boolean;
}

export function SavingThrowsRow({ monster, adapter, autoOpen = false }: SavingThrowsRowProps) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const { valueOf, commit } = saveCommitter(adapter);
  const proficient = ABILITIES.filter((a) => monster.savingThrows[a] !== undefined);
  const pb = proficiencyBonus(monster);

  const items = ABILITIES.filter(
    (a) => monster.savingThrows[a] === undefined && valueOf(a) !== undefined,
  ).map((ability) => ({
    // The bonus a proficient save would have: the modifier plus PB.
    label: `${ABILITY_ABBREV[ability]} ${formatModifier(
      abilityModifier(monster.abilities[ability]) + pb,
    )}`,
    onClick: () => commit(ability, true),
  }));

  return (
    <span class="sb-chips" data-field="saves">
      {proficient.map((ability) => (
        <Chip
          key={ability}
          value={ability}
          label={ABILITY_ABBREV[ability]}
          detail={formatModifier(saveBonus(monster, ability))}
          onRemove={() => commit(ability, false)}
        />
      ))}
      {/* Proficient in everything: keep the chips, drop the affordance. */}
      {items.length > 0 ? (
        <span class="sb-chip-menu">
          <OptionPicker
            options={items}
            trigger={{ text: "+", ariaLabel: "Add saving throw", variant: "add" }}
            focusKey="add:savingThrows"
            open={open}
            onOpenChange={setOpen}
          />
        </span>
      ) : null}
    </span>
  );
}
