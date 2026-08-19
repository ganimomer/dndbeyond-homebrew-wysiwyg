/**
 * The chip primitives shared by every multi-value field in the stat block
 * (creature subtypes, skills). Same contract as the rest of `preview/`: the
 * renderer emits marked-up DOM, the editor wires behavior onto the markers.
 *
 *   - `.sb-chip[data-value]`  — one value, carrying the token the editor commits
 *   - `.sb-chip-remove`       — its ✕
 *   - `.sb-chip-add`          — the "＋" affordance (a plain button here; the
 *                               skills editor swaps it for a dropdown trigger)
 */
import { el } from "./dom.js";

export interface ChipOptions {
  /** The token the editor commits (an option value, or the label itself). */
  value: string;
  label: string;
  /** Trailing detail shown after the label, e.g. a skill's "+7". */
  detail?: string;
}

export function chip({ value, label, detail }: ChipOptions): HTMLElement {
  const tag = el("span", "sb-chip");
  tag.dataset.value = value;

  const text = el("span", "sb-chip-label");
  text.textContent = label;
  tag.append(text);

  if (detail) {
    const extra = el("span", "sb-chip-detail");
    extra.textContent = detail;
    tag.append(" ", extra);
  }

  const remove = el("button", "sb-chip-remove");
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${label}`);
  remove.textContent = "×";
  tag.append(remove);
  return tag;
}

/** The "＋" button that opens a field's add affordance. */
export function addButton(ariaLabel: string): HTMLButtonElement {
  const button = el("button", "sb-chip-add");
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  button.textContent = "+";
  return button;
}
