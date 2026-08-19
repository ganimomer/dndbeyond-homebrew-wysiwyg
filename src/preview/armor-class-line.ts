/**
 * The armor-class value, closed: one chip carrying "16 (natural armor)" and a
 * gear, which `wireArmorClass` swaps for the split editor.
 *
 * Same shape as the hit-points chip — the whole value is the button, since the
 * number and its qualifier are edited in the same form.
 */
import type { Monster } from "../statblock/model.js";
import { armorClassText } from "../statblock/armor-class.js";
import { el } from "./dom.js";
import { makeIcon } from "./icons.js";

export function armorClassChip(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "armorClass";

  const button = el("button", "sb-chip sb-chip-button");
  button.type = "button";
  button.dataset.focusKey = "ac:open";
  button.setAttribute("aria-label", "Edit armor class");

  const text = el("span", "sb-chip-detail");
  text.textContent = armorClassText(monster.armorClass);
  button.append(text, makeIcon("settings", 14));

  wrap.append(button);
  return wrap;
}
