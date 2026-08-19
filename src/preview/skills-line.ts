/**
 * The Skills row's value: one removable chip per skill, then a "＋" the editor
 * turns into a menu of the skills the creature doesn't have yet
 * (`wireSkills`). Shared by both renderers.
 *
 * The bonus shown is the one D&D Beyond has stored, not a recomputed one — a
 * homebrewer may have deliberately typed an expertise bonus, and the row would
 * be lying if we quietly replaced it. Computing only happens when *adding* a
 * skill, where DDB would otherwise make the user do the arithmetic.
 */
import type { Monster } from "../statblock/model.js";
import { formatModifier } from "../statblock/compute.js";
import { el } from "./dom.js";
import { addButton, chip } from "./tags.js";

export function skillsChips(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "skills";

  for (const [name, bonus] of Object.entries(monster.skills)) {
    wrap.append(chip({ value: name, label: name, detail: formatModifier(bonus) }));
  }

  // The editor replaces this with the dropdown's trigger; on its own it's an
  // inert affordance, which is right for a preview with no editor attached.
  const menuHost = el("span", "sb-chip-menu");
  menuHost.append(addButton("Add skill"));
  wrap.append(menuHost);
  return wrap;
}
