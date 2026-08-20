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
  // Lets the panel put the caret back after a re-render (see restoreFocus).
  input.dataset.focusKey = `score:${ability}`;
  input.setAttribute("aria-label", label);
  return input;
}

/**
 * A placeholder the editor fills with an autosave spinner (or a retry button)
 * for `origin`. Empty and zero-width while idle, so it costs nothing visually
 * until something is actually saving. Same contract as `data-mod`/`data-dep`:
 * the renderers mark the spot, the editor supplies the behavior.
 */
export function saveSlot(origin: string): HTMLElement {
  const slot = el("span", "save-slot");
  slot.dataset.saveOrigin = origin;
  return slot;
}
