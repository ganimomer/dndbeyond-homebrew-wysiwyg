/**
 * Where a menu hangs off the thing that opened it, as arithmetic.
 *
 * Deliberately not `editor/tooltip-placement.ts`, which is the same shape and
 * the opposite rules: a definition wants to be *centred above* the word it
 * defines, because it is a remark about text the author is already reading. A
 * menu wants to be *below and left-aligned*, because it is a list the author is
 * about to read top-down, and above would cover the words they just typed.
 * Forcing one function to be both would take an options bag longer than either.
 *
 * Pure, so the flip and the clamp are testable without a browser.
 */

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Breathing room from the anchor, and from the viewport edge. */
const GAP = 4;
const MARGIN = 8;

export function menuPlacement(anchor: Rect, size: Size, viewport: Size): { left: number; top: number } {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const fitsBelow = below + size.height <= viewport.height - MARGIN;
  // Below unless it would run off the bottom — and then only if there is
  // actually room above. A viewport too short for either keeps it below, where
  // the list can at least be scrolled to.
  const top = fitsBelow || above < MARGIN ? below : above;

  const rightmost = viewport.width - size.width - MARGIN;
  // `Math.max` last, so a panel wider than the viewport pins to the left edge
  // rather than being pushed off the other one.
  const left = Math.max(MARGIN, Math.min(anchor.left, rightmost));
  return { left, top };
}
