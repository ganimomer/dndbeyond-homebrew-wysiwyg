/**
 * Shared behavior for the stat block's inline text fields (ability scores,
 * movement distances, the creature name).
 */

/**
 * Makes Enter commit the field.
 *
 * These inputs commit on `change`, which the browser fires when the user is
 * done editing. For a standalone input — no `<form>` to submit, which is our
 * case inside the overlay's shadow root — that means blur *only*: pressing
 * Enter leaves the typed value sitting uncommitted, which reads as the edit
 * being silently dropped. Blurring on Enter produces the `change` and the
 * commit the user expects (verified against the live page).
 */
export function commitOnEnter(input: HTMLElement): void {
  input.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Enter") return;
    event.preventDefault();
    input.blur();
  });
}
