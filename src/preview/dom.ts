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

/** Which meta-line control a `<select>` drives. */
export type MetaKind = "size" | "type" | "subType" | "alignment";

const META_LABEL: Record<MetaKind, string> = {
  size: "Size",
  type: "Creature type",
  subType: "Creature subtype",
  alignment: "Alignment",
};

/** True where the browser supports the customizable-select feature (Chrome 135+). */
const SUPPORTS_BASE_SELECT =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" &&
  CSS.supports("appearance", "base-select");

/**
 * An editable meta-line control (size, creature type, alignment): a real
 * `<select>` tagged for `wireMetaControls` to fill with options. Where the
 * customizable-select feature exists it gets the `<button><selectedcontent>`
 * trigger so it can be styled to read as inline text; elsewhere it stays a plain
 * native select (Firefox). Seeded with the current label as a lone option until
 * wired. Pass `isPlaceholder` when `currentText` is prompt text rather than a
 * real value, so it renders dimmed.
 */
export function metaSelect(
  kind: MetaKind,
  currentText: string,
  isPlaceholder = false,
): HTMLSelectElement {
  const select = el("select", "meta-select");
  select.dataset.meta = kind;
  select.setAttribute("aria-label", META_LABEL[kind]);
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
