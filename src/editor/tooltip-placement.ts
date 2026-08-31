/**
 * Where the tooltip goes, as arithmetic.
 *
 * D&D Beyond anchors theirs to the cursor. We anchor to the token instead:
 * with a delay before opening, the cursor has moved by the time we paint, and
 * a rect needs no `mousemove` listener running over the whole overlay. It also
 * reads better over a phrase than over wherever the pointer happened to stop.
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

export interface Placement {
  left: number;
  top: number;
  /** Which side of the token it ended up on, for a future arrow or animation. */
  placement: "above" | "below";
}

/** Breathing room between the token and the popup, and from the viewport edge. */
const GAP = 8;
const MARGIN = 8;

export function tooltipPlacement(
  anchor: Rect,
  size: Size,
  viewport: Size,
  gap: number = GAP,
): Placement {
  // Above by default — a definition sits better over the word than under the
  // line that follows it — and below only when there isn't room up there.
  const above = anchor.top - gap - size.height;
  const below = anchor.bottom + gap;
  const fitsAbove = above >= MARGIN;
  const fitsBelow = below + size.height <= viewport.height - MARGIN;
  const placement: "above" | "below" = fitsAbove || !fitsBelow ? "above" : "below";

  const centered = (anchor.left + anchor.right) / 2 - size.width / 2;
  const rightmost = viewport.width - size.width - MARGIN;
  // `Math.max` last, so a popup wider than the viewport pins to the left edge
  // rather than being pushed off the other one.
  const left = Math.max(MARGIN, Math.min(centered, rightmost));

  const top = placement === "above" ? Math.max(MARGIN, above) : below;
  return { left, top, placement };
}
