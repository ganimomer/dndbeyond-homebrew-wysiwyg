/**
 * The hit-points value, closed: one chip carrying the whole "195 (23d8 + 92)"
 * and a gear, which `wireHitPoints` swaps for the four-field editor.
 *
 * Unlike the other chips this one isn't a value in a set, so it has no ✕ and
 * nothing to add beside it — the entire chip is the button, since every part of
 * the sentence leads to the same form.
 */
import type { Monster } from "../statblock/model.js";
import { hitPointsText } from "../statblock/hit-points.js";
import { el } from "./dom.js";
import { makeIcon } from "./icons.js";

export function hitPointsChip(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "hitPoints";

  const button = el("button", "sb-chip sb-chip-button");
  button.type = "button";
  button.dataset.focusKey = "hp:open";
  button.setAttribute("aria-label", "Edit hit points");

  const text = el("span", "sb-chip-detail");
  text.textContent = hitPointsText(monster.hitPoints);
  button.append(text, makeIcon("settings", 14));

  wrap.append(button);
  return wrap;
}
