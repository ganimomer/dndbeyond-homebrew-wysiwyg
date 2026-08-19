/**
 * The 5e layout's "Saving Throws" value: a removable chip per proficient save,
 * then a "＋" the editor turns into a menu of the abilities not yet proficient
 * (`wireSavingThrows`).
 *
 * The 5.5e layout doesn't use this — it prints all six saves in the ability
 * tables, where proficiency is a toggle in the Save cell instead.
 */
import { ABILITIES, ABILITY_ABBREV, type Monster } from "../statblock/model.js";
import { formatModifier, saveBonus } from "../statblock/compute.js";
import { el } from "./dom.js";
import { addButton, chip } from "./tags.js";

export function savingThrowChips(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "saves";

  for (const ability of ABILITIES) {
    if (monster.savingThrows[ability] === undefined) continue;
    wrap.append(
      chip({
        value: ability,
        label: ABILITY_ABBREV[ability],
        detail: formatModifier(saveBonus(monster, ability)),
      }),
    );
  }

  const menuHost = el("span", "sb-chip-menu");
  menuHost.append(addButton("Add saving throw"));
  wrap.append(menuHost);
  return wrap;
}
