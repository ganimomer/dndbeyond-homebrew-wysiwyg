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

/** Which meta-line control a `<select>` drives. */
export type MetaKind = "type" | "subType";

/** True where the browser supports the customizable-select feature (Chrome 135+). */
const SUPPORTS_BASE_SELECT =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" &&
  CSS.supports("appearance", "base-select");

/**
 * An editable creature type/subtype control for the meta line: a real `<select>`
 * tagged for `wireMetaSelects` to fill with options. Where the customizable-
 * select feature exists it gets the `<button><selectedcontent>` trigger so it
 * can be styled to read as inline text; elsewhere it stays a plain native select
 * (Firefox). Seeded with the current label as a lone option until wired.
 */
export function metaSelect(
  kind: MetaKind,
  currentText: string,
  isPlaceholder = false,
): HTMLSelectElement {
  const select = el("select", "meta-select");
  select.dataset.meta = kind;
  select.setAttribute("aria-label", kind === "type" ? "Creature type" : "Creature subtype");
  if (isPlaceholder) select.classList.add("is-placeholder");

  if (SUPPORTS_BASE_SELECT) {
    const button = el("button", "meta-select-button");
    button.type = "button";
    button.appendChild(document.createElement("selectedcontent"));
    select.appendChild(button);
  }

  const option = el("option");
  option.textContent = currentText;
  option.selected = true;
  select.appendChild(option);
  return select;
}
