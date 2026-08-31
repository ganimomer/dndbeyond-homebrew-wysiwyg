/**
 * The Skills row: one removable chip per skill, and a "＋" offering the ones
 * the creature hasn't got.
 *
 * The bonus on a chip is the one D&D Beyond has stored, not a recomputed one —
 * a homebrewer may have deliberately typed an expertise bonus, and the row
 * would be lying if we quietly replaced it. Computing happens only when
 * *adding* a skill, where DDB would otherwise make the user do the arithmetic
 * themselves; that is what the menu labels show.
 *
 * Unlike the form fields, these edits don't ride autosave: DDB keeps skills as
 * separate records with their own endpoints, so each one is a round-trip. The
 * row goes `is-busy` while it is in flight, so a second click can't race the
 * first.
 */
import { useEffect, useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import { ABILITY_ABBREV, type Monster } from "../../statblock/model.js";
import { formatModifier } from "../../statblock/compute.js";
import { SKILL_ABILITY, skillBonus } from "../../statblock/skills.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";

/** The adapter surface the Skills row needs (satisfied by PageAdapter). */
export interface SkillsAdapter {
  skillOptions(): SelectOption[];
  addSkill(value: string, bonus: number): Promise<void>;
  removeSkill(name: string): Promise<void>;
}

export interface SkillsRowProps {
  monster: Monster;
  adapter: SkillsAdapter;
  /** Open the menu on arrival — the row was just added to be filled in. */
  autoOpen?: boolean;
  onError?: (error: unknown) => void;
}

/** How a skill reads in the menu: "Stealth (DEX) +9", or bare if we can't say. */
function menuLabel(monster: Monster, name: string): string {
  const bonus = skillBonus(monster, name);
  const ability = SKILL_ABILITY[name];
  // Skills outside the standard table have no governing ability to derive
  // from, so they go in unadorned rather than guessing.
  if (bonus === undefined || !ability) return name;
  return `${name} (${ABILITY_ABBREV[ability]}) ${formatModifier(bonus)}`;
}

export function SkillsRow({ monster, adapter, autoOpen = false, onError }: SkillsRowProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(autoOpen);

  // Adding a row from the "Add…" menu is always a prelude to picking something,
  // so it arrives with the menu already down.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const run = (work: Promise<void>) => {
    setBusy(true);
    void work
      .catch((error) => onError?.(error))
      // The row is redrawn by the re-render DDB's table update triggers, but
      // this component survives it, so the flag is ours to clear.
      .finally(() => setBusy(false));
  };

  const available = adapter.skillOptions().filter((option) => !option.selected);
  const items = available.map((option) => ({
    label: menuLabel(monster, option.text),
    onClick: () => run(adapter.addSkill(option.value, skillBonus(monster, option.text) ?? 0)),
  }));

  return (
    <span class={busy ? "sb-chips is-busy" : "sb-chips"} data-field="skills">
      {Object.entries(monster.skills).map(([name, bonus]) => (
        <Chip
          key={name}
          value={name}
          label={name}
          detail={formatModifier(bonus)}
          onRemove={() => run(adapter.removeSkill(name))}
        />
      ))}
      {/* Every skill taken: keep the chips, drop the affordance. */}
      {items.length > 0 ? (
        <span class="sb-chip-menu">
          <OptionPicker
            options={items}
            trigger={{ text: "+", ariaLabel: "Add skill", variant: "add" }}
            filterPlaceholder="Filter skills…"
            focusKey="add:skills"
            open={open}
            onOpenChange={setOpen}
          />
        </span>
      ) : null}
    </span>
  );
}
