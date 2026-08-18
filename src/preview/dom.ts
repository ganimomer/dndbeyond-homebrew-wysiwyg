import type { Ability } from "../statblock/model.js";

/** Tiny element builder shared by the stat-block renderers. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * An editable ability-score field, tagged so `wireAbilityInputs` can drive it.
 * Positive integers only; the editor commits it back to the form on blur.
 */
export function scoreInput(
  ability: Ability,
  score: number,
  label: string,
): HTMLInputElement {
  const input = el("input", "score-input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = String(score);
  input.dataset.ability = ability;
  input.setAttribute("aria-label", label);
  return input;
}
