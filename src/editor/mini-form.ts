/**
 * The pieces a stat-block mini-form is built from, shared by the hit-points and
 * armor-class editors.
 *
 * These forms open in place of a chip, over fields D&D Beyond keeps apart, and
 * they all want the same things: a chip offering a value a related edit has
 * invalidated, the ✕/✓ pair that abandons or applies the edit, a coercion for
 * the numeric fields, and the click-away that abandons it. Keeping them here is
 * what stops the second form from being a copy of the first.
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

/**
 * Abandons the form when the click lands anywhere but inside it, and hands back
 * the teardown — the block is rebuilt on every render, so whoever mounts the
 * form owns detaching this with it.
 *
 * Three choices worth spelling out, all of them the ones `ContextMenu` already
 * made: the path is read with `composedPath()` because the panel lives in a
 * shadow root, where a listener out here would otherwise only ever see the host;
 * it listens on `window` in the capture phase, so a click on D&D Beyond's own
 * page underneath the overlay counts as outside too; and it listens for `click`
 * rather than `pointerdown`, so the click still reaches whatever it landed on —
 * which is what lets one click close this form and open the next chip's.
 *
 * The click that *opened* the form can't close it again: the panel re-renders
 * synchronously from the chip's own click handler, by which point the capture
 * phase for that click is long past.
 */
export function closeOnOutsideClick(form: HTMLElement, onOutside: () => void): () => void {
  const handler = (event: Event) => {
    if (!event.composedPath().includes(form)) onOutside();
  };
  window.addEventListener("click", handler, true);
  return () => window.removeEventListener("click", handler, true);
}

/** A field's text as a whole number, or `fallback` when it's blank or junk. */
export function toInt(raw: string, fallback: number): number {
  const n = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(n) ? n : fallback;
}
