/**
 * Makes saving-throw proficiency editable in whichever layout is rendered:
 *
 *   - 5e prints the saves inline, so they're chips like skills — a ✕ per
 *     proficient save and a "＋" menu of the rest;
 *   - 5.5e prints all six in the ability tables, so each Save cell is a toggle
 *     (`.save-toggle`) that flips its proficiency dot.
 *
 * Both drive the same form control: one multi-select, so every edit commits the
 * *whole* set, the way `wireSubTypes` does. Unlike skills there's no bonus to
 * write — D&D Beyond derives a proficient save as mod + PB by itself.
 */
import type { SelectOption } from "../adapter/types.js";
import {
  ABILITIES,
  ABILITY_ABBREV,
  type Ability,
  type Monster,
} from "../statblock/model.js";
import { abilityModifier, formatModifier, proficiencyBonus } from "../statblock/compute.js";
import { ChipPicker } from "./chip-picker.js";

/** The adapter surface the saving throws need (satisfied by PageAdapter). */
export interface SavesAdapter {
  savingThrowOptions(): SelectOption[];
  setSavingThrows(values: string[]): void;
}

export function wireSavingThrows(
  scope: ParentNode,
  monster: Monster,
  adapter: SavesAdapter,
): ChipPicker[] {
  const options = adapter.savingThrowOptions();
  // DDB labels the options with the same abbreviations we render, which is what
  // ties an ability in the stat block to an option value in the form.
  const abilityToValue = new Map(
    options.map((o) => [o.text.trim().toUpperCase(), o.value] as const),
  );
  const valueOf = (ability: Ability) => abilityToValue.get(ABILITY_ABBREV[ability]);
  const current = options.filter((o) => o.selected).map((o) => o.value);

  const commit = (ability: Ability, proficient: boolean) => {
    const value = valueOf(ability);
    if (value === undefined) return;
    adapter.setSavingThrows(
      proficient ? [...current, value] : current.filter((v) => v !== value),
    );
  };

  wireToggles(scope, commit);
  return wireChips(scope, monster, valueOf, commit);
}

/** 5.5e: each Save cell flips its own proficiency. */
function wireToggles(
  scope: ParentNode,
  commit: (ability: Ability, proficient: boolean) => void,
): void {
  for (const button of scope.querySelectorAll<HTMLButtonElement>(".save-toggle")) {
    const ability = button.dataset.saveToggle as Ability | undefined;
    if (!ability) continue;
    const proficient = button.getAttribute("aria-pressed") === "true";
    button.addEventListener("click", () => commit(ability, !proficient));
  }
}

/** 5e: chips to remove, a "＋" menu to add. */
function wireChips(
  scope: ParentNode,
  monster: Monster,
  valueOf: (ability: Ability) => string | undefined,
  commit: (ability: Ability, proficient: boolean) => void,
): ChipPicker[] {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="saves"]');
  if (!wrap) return [];

  for (const btn of wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove")) {
    const ability = btn.closest<HTMLElement>(".sb-chip")?.dataset.value as Ability | undefined;
    if (!ability) continue;
    btn.addEventListener("click", () => commit(ability, false));
  }

  const host = wrap.querySelector<HTMLElement>(".sb-chip-menu");
  if (!host) return [];

  const pb = proficiencyBonus(monster);
  const items = ABILITIES.filter(
    (a) => monster.savingThrows[a] === undefined && valueOf(a) !== undefined,
  )
    .map((ability) => ({
      // The bonus a proficient save would have: the modifier plus PB.
      label: `${ABILITY_ABBREV[ability]} ${formatModifier(abilityModifier(monster.abilities[ability]) + pb)}`,
      onClick: () => commit(ability, true),
    }));

  if (!items.length) {
    // Proficient in everything — keep the chips, drop the affordance.
    host.remove();
    return [];
  }

  const menu = new ChipPicker(items, { label: "Add saving throw" });
  host.replaceChildren(menu.element);
  return [menu];
}
