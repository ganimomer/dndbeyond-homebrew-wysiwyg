/**
 * The foot of the basics section: the button that offers every field the
 * creature hasn't got.
 *
 * All that is left of this module. The chips themselves are a component now
 * (ui/shared/Chip.tsx); this stays until the layouts are components too, at
 * which point the footer goes with them.
 */
import { el } from "./dom.js";
import { makeIcon } from "./icons.js";

/**
 * Inert here — `wireAddField` swaps it for the menu — and rendered only when
 * something is actually missing.
 */
export function addFieldButton(): HTMLElement {
  const wrap = el("div", "add-field");
  const button = el("button", "sb-add-field");
  button.type = "button";
  button.append(makeIcon("add", 16), "Add…");
  wrap.append(button);
  return wrap;
}
