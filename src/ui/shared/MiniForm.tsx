/**
 * The pieces a stat-block mini-form is built from, shared by the hit-points and
 * armor-class editors.
 *
 * These forms open in place of a chip, over fields D&D Beyond keeps apart, and
 * they all want the same things: a chip offering a value a related edit has
 * invalidated, the ✕/✓ pair that abandons or applies the edit, and the
 * click-away that abandons it.
 */
import { useLayoutEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { Icon } from "./Icon.js";

/**
 * The "←218" a field grows when another edit has left it behind. A real button,
 * so it's a tab stop that Enter and Space activate without help from us.
 *
 * An offer, never an application: nothing changes until the user takes it. That
 * is the whole point of a hint rather than a recompute — the value it's
 * displacing may well have been set on purpose.
 *
 * A string value is for the armor-class row's qualifier — "←splint" — which is
 * the one offered field on the block that isn't a number.
 */
export function HintChip({
  name,
  value,
  onTake,
}: {
  name: string;
  value: string | number;
  onTake: () => void;
}) {
  return (
    <button
      type="button"
      class="sb-hint"
      data-hint={name}
      data-focus-key={`hint:${name}`}
      aria-label={`Set ${name} to ${value}`}
      onClick={onTake}
    >
      {`←${value}`}
    </button>
  );
}

/** One of a form's trailing icon buttons: ✕ to abandon, ✓ to apply. */
export function IconButton({
  action,
  icon,
  label,
  onClick,
}: {
  action: string;
  icon: "close" | "check";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class="sb-form-action"
      data-form-action={action}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/**
 * Abandons the form when a click lands anywhere but inside it.
 *
 * Three choices worth spelling out: the path is read with `composedPath()`
 * because this lives in a shadow root, where a listener out on `window` would
 * otherwise only ever see the host; it listens in the capture phase, so a click
 * on D&D Beyond's own page underneath the overlay counts as outside too; and it
 * listens for `click` rather than `pointerdown`, so the click still reaches
 * whatever it landed on — which is what lets one click close this form and open
 * the next chip's.
 *
 * The click that *opened* the form can't close it again: the form is rendered
 * synchronously from the chip's own click handler, by which point the capture
 * phase for that click is long past.
 */
export function useCloseOnOutsideClick(
  form: RefObject<HTMLElement | null>,
  open: boolean,
  onOutside: () => void,
): void {
  useLayoutEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      const node = form.current;
      if (node && !event.composedPath().includes(node)) onOutside();
    };
    window.addEventListener("click", handler, true);
    return () => window.removeEventListener("click", handler, true);
  }, [open, onOutside]);
}

/** A field's text as a whole number, or `fallback` when it's blank or junk. */
export function toInt(raw: string, fallback: number): number {
  const n = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(n) ? n : fallback;
}
