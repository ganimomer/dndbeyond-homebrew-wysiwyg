/**
 * The rows backed by a single free-text D&D Beyond input — Gear and the
 * Languages note. The value is edited in place; the ✕ clears it, which (having
 * no value left) is also what takes the row back off the stat block.
 *
 * Same contract as the rest of `preview/`: this emits the marked-up DOM and
 * `wireTextField` supplies the behavior.
 */
import { el } from "./dom.js";

/** The fields this module renders, named for the model field they show. */
export type TextField = "gear" | "languages";

export function textValue(field: TextField, value: string, label: string, placeholder: string): HTMLElement {
  const wrap = el("span", "sb-text");
  wrap.dataset.field = field;

  const input = el("input", "sb-text-input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.dataset.focusKey = `text:${field}`;
  input.setAttribute("aria-label", label);

  const clear = el("button", "sb-text-clear");
  clear.type = "button";
  clear.textContent = "×";
  clear.setAttribute("aria-label", `Clear ${label}`);

  wrap.append(input, clear);
  return wrap;
}
