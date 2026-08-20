/**
 * The two things every inline field in the stat block does.
 *
 * They are uncontrolled: the value seeds the box and the user owns it from
 * then on, committing on `change` — blur or Enter, never per keystroke. That
 * rule predates the components (a creature whose name changed on every letter
 * would be unusable), and it is also what stops a re-render landing mid-word
 * from fighting whoever is typing.
 */
import { useLayoutEffect } from "preact/hooks";
import type { RefObject } from "preact";

/**
 * Follows `value` when it changes underneath — an edit made in D&D Beyond's own
 * field, or a write-back that renamed something — but never while the user is
 * in the box.
 *
 * A layout effect, so the box is right before anything can look at it: the
 * render loop reads the block it has just drawn.
 */
export function useSyncedValue(
  ref: RefObject<HTMLInputElement | null>,
  value: string,
): void {
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const root = input.getRootNode() as unknown as DocumentOrShadowRoot;
    if (root.activeElement === input) return;
    input.value = value;
  }, [value]);
}

/**
 * Makes Enter commit the field.
 *
 * These inputs commit on `change`, which the browser fires when the user is
 * done editing. For a standalone input — no `<form>` to submit, which is our
 * case inside the overlay's shadow root — that means blur *only*: pressing
 * Enter would otherwise leave the typed value sitting uncommitted, which reads
 * as the edit being silently dropped. (Verified against the live page.)
 */
export function blurOnEnter(event: KeyboardEvent): void {
  if (event.key !== "Enter") return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).blur();
}
