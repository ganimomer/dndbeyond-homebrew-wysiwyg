/**
 * The pieces a stat-block mini-form is built from, shared by the hit-points and
 * armor-class editors.
 *
 * These forms open in place of a chip, over fields D&D Beyond keeps apart, and
 * they all want the same three things: a chip offering a value a related edit
 * has invalidated, the ✕/✓ pair that abandons or applies the edit, and a
 * coercion for the numeric fields. Keeping them here is what stops the second
 * form from being a copy of the first.
 */
import { el } from "../preview/dom.js";
import { makeIcon } from "../preview/icons.js";

/**
 * The "←218" a field grows when another edit has left it behind. A real button,
 * so it's a tab stop that Enter and Space activate without help from us.
 *
 * An offer, never an application: nothing changes until the user takes it. That
 * is the whole point of a hint rather than a recompute — the value it's
 * displacing may well have been set on purpose.
 */
export function hintChip(name: string, value: number, onTake: () => void): HTMLButtonElement {
  const button = el("button", "sb-hint");
  button.type = "button";
  button.dataset.hint = name;
  button.dataset.focusKey = `hint:${name}`;
  button.textContent = `←${value}`;
  button.setAttribute("aria-label", `Set ${name} to ${value}`);
  button.addEventListener("click", onTake);
  return button;
}

/** One of a form's trailing icon buttons: ✕ to abandon, ✓ to apply. */
export function iconButton(
  action: string,
  icon: "close" | "check",
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el("button", "sb-form-action");
  button.type = "button";
  button.dataset.formAction = action;
  button.setAttribute("aria-label", label);
  button.append(makeIcon(icon, 16));
  button.addEventListener("click", onClick);
  return button;
}

/** A field's text as a whole number, or `fallback` when it's blank or junk. */
export function toInt(raw: string, fallback: number): number {
  const n = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(n) ? n : fallback;
}
