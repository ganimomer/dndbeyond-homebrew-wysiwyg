/**
 * Where a dragged entry would land — the arithmetic of it, with no DOM in
 * sight.
 *
 * Kept separate because this is the part that has to be *right*: an entry
 * dropped one place off is an author's trait silently in the wrong order. It
 * takes rectangles and a pointer's y and answers with a section and an
 * insertion index, so it can be tested on numbers rather than on a browser —
 * which matters especially here, where the test harness (jsdom) has no layout
 * at all and every rectangle it produces is zero.
 */
import type { SectionKey } from "../../statblock/model.js";

/** Top and bottom of something, in viewport coordinates. */
export interface Span {
  readonly top: number;
  readonly bottom: number;
}

/** One section's list, as the drag sees it. */
export interface ListGeometry extends Span {
  readonly section: SectionKey;
  /** Its entries, in the order they are printed. */
  readonly items: readonly Span[];
}

/** An insertion point: before entry `index` of `section`. */
export interface DropTarget {
  readonly section: SectionKey;
  readonly index: number;
}

/** How far a y is from a span — 0 while it is inside it. */
function distance(span: Span, y: number): number {
  return y < span.top ? span.top - y : y > span.bottom ? y - span.bottom : 0;
}

/**
 * The insertion point a pointer at `y` is asking for.
 *
 * The list it is over, or failing that the nearest one — a pointer in the
 * heading between two sections is between two lists, and answering "nowhere"
 * there would make the indicator blink out every time the author crosses a
 * boundary. Within the list it is the entries' midpoints that divide one
 * insertion point from the next, which is what makes the indicator flip to the
 * other side of an entry exactly as the pointer passes its middle.
 */
export function dropTargetAt(lists: readonly ListGeometry[], y: number): DropTarget | null {
  if (lists.length === 0) return null;
  let over = lists[0]!;
  for (const list of lists) {
    if (distance(list, y) < distance(over, y)) over = list;
  }
  let index = 0;
  for (const item of over.items) {
    if (y <= (item.top + item.bottom) / 2) break;
    index += 1;
  }
  return { section: over.section, index };
}

/**
 * `items` with the one at `from` moved to the insertion point `to`.
 *
 * `to` counts the gaps rather than the entries — the same coordinates
 * `dropTargetAt` speaks — so dropping an entry back into either of the two gaps
 * it already touches leaves the list alone.
 */
export function moveWithin<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  if (to === from || to === from + 1) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, moved!);
  return next;
}
