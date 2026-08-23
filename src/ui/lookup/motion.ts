/**
 * Whether this author wants things to move.
 *
 * Read in JS as well as in CSS because the two halves have to agree: the frame
 * is unmounted on a timer, and a timer that outlived a transition which never
 * ran would leave a dead panel on screen for a quarter of a second. Read fresh
 * each time rather than cached, so changing the system setting takes effect
 * without reopening the overlay.
 */
export function motionOk(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true;
}
