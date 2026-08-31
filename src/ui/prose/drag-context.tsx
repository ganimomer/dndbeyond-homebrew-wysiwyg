/**
 * The one place the sections meet.
 *
 * A section's entries are that section's own state — a row is a mounted Lexical
 * editor with a caret and an undo stack in it, which is why `SectionList` holds
 * them rather than deriving them. But an entry dragged from Actions to Bonus
 * Actions has to leave one list and arrive in another, so the lists register a
 * handle here and the drag is run from above them.
 *
 * The drag's own state is published through a subscription rather than through
 * context state on purpose: a pointer crossing an entry's midline must repaint
 * two gaps, not the whole stat block. Nothing that holds an editor subscribes,
 * so nothing that holds an editor re-renders while the author is dragging.
 */
import { createContext, type ComponentChildren } from "preact";
import { useContext, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { SectionKey } from "../../statblock/model.js";
import { dropTargetAt, type DropTarget, type ListGeometry } from "./item-drag.js";

/** What a section's list lets the drag do to it. */
export interface ListHandle {
  readonly section: SectionKey;
  /** The `.sb-section-list` element, for measuring and for ordering. */
  readonly element: HTMLElement;
  count(): number;
  /** Where an entry currently sits, or -1 if it isn't here. */
  indexOf(id: number): number;
  /** Removes the entry and hands back its HTML, writing the section. */
  take(id: number): string;
  /** Puts HTML in as an entry at `index`, writing the section. */
  insert(html: string, index: number, focusHandle: boolean): void;
  /** Moves one of its own entries to `index` — the entry keeps its editor. */
  move(id: number, index: number): void;
  /** Puts keyboard focus back on an entry's handle after it has moved. */
  focusHandle(id: number): void;
}

/** The entry in the author's hand, and where it would land. */
export interface DragState {
  readonly section: SectionKey;
  readonly id: number;
  readonly target: DropTarget | null;
}

/** How far the pointer travels before a press on a handle becomes a drag. */
const THRESHOLD = 4;
/** How close to the edge of the scroller before the page follows the pointer. */
const EDGE = 56;
/** How fast it follows, in pixels per frame at the very edge. */
const EDGE_SPEED = 14;

export class ItemDragController {
  private readonly lists = new Map<SectionKey, ListHandle>();
  private readonly listeners = new Set<(state: DragState | null) => void>();
  private state: DragState | null = null;

  /** A list saying it is on the block, and the same list saying it has gone. */
  register(handle: ListHandle): () => void {
    this.lists.set(handle.section, handle);
    return () => {
      if (this.lists.get(handle.section) === handle) this.lists.delete(handle.section);
    };
  }

  subscribe(listener: (state: DragState | null) => void): () => void {
    this.listeners.add(listener);
    // Called at once, so a gap mounted mid-drag knows what it has walked into.
    listener(this.state);
    return () => void this.listeners.delete(listener);
  }

  /** Picks an entry up with the pointer. */
  start(section: SectionKey, id: number, event: PointerEvent): void {
    if (event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement | null;
    if (!handle) return;
    // Not `preventDefault`: the press should still focus the handle, which is
    // what leaves the arrow keys pointed at this entry when the drag is over.
    handle.focus?.();
    // Absent in the test harness, and not worth having a drag depend on.
    handle.setPointerCapture?.(event.pointerId);

    const doc = handle.closest(".sb-doc");
    const scroller = handle.closest(".overlay") as HTMLElement | null;
    const startX = event.clientX;
    const startY = event.clientY;
    let y = startY;
    let armed = false;
    let frame = 0;

    const update = () => this.publish({ section, id, target: dropTargetAt(this.geometry(), y) });

    // The page follows the pointer when it reaches the edge, because the
    // section an entry is going to is often not the one it came from, and both
    // rarely fit on screen at once.
    const follow = () => {
      frame = requestAnimationFrame(follow);
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const above = y - (rect.top + EDGE);
      const below = y - (rect.bottom - EDGE);
      // How far into the edge zone the pointer is, and which end of it.
      const reach = above < 0 ? above : below > 0 ? below : 0;
      if (reach === 0) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += (reach / EDGE) * EDGE_SPEED;
      // The pointer hasn't moved but everything under it has.
      if (scroller.scrollTop !== before) update();
    };

    const onMove = (moved: PointerEvent) => {
      y = moved.clientY;
      if (!armed) {
        if (Math.hypot(moved.clientX - startX, moved.clientY - startY) < THRESHOLD) return;
        armed = true;
        doc?.classList.add("is-item-dragging");
        frame = requestAnimationFrame(follow);
      }
      update();
    };

    const finish = (drop: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      if (frame) cancelAnimationFrame(frame);
      handle.releasePointerCapture?.(event.pointerId);
      doc?.classList.remove("is-item-dragging");
      const landing = this.state;
      this.publish(null);
      if (drop && armed && landing) this.drop(landing);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      finish(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // Capture, so Escape reaches us before anything else decides what it meant.
    window.addEventListener("keydown", onKey, true);
  }

  /**
   * The same move from the keyboard: ↑/↓ within the section, and with Alt to
   * the section above or below. An entry lands at the near edge of the section
   * it moves into — going up it joins the foot of the one above — because that
   * is where it was when it crossed the boundary.
   */
  moveByKeyboard(section: SectionKey, id: number, step: -1 | 1, acrossSections: boolean): void {
    const list = this.lists.get(section);
    if (!list) return;
    const index = list.indexOf(id);
    if (index < 0) return;

    if (!acrossSections) {
      const to = step < 0 ? index - 1 : index + 2;
      if (to < 0 || to > list.count()) return;
      list.move(id, to);
      list.focusHandle(id);
      return;
    }

    const order = this.ordered();
    const next = order[order.indexOf(list) + step];
    if (!next) return;
    next.insert(list.take(id), step < 0 ? next.count() : 0, true);
  }

  /** Everything the pointer drag has to say once it is let go. */
  private drop(state: DragState): void {
    const { target } = state;
    if (!target) return;
    const from = this.lists.get(state.section);
    const to = this.lists.get(target.section);
    if (!from || !to) return;
    if (from === to) {
      from.move(state.id, target.index);
      return;
    }
    // A mouse drag doesn't move the caret or the tab position: the author's
    // hand is on the mouse, and the entry they dropped is where they are
    // looking.
    to.insert(from.take(state.id), target.index, false);
  }

  /** The lists in the order the block prints them, whatever order they registered in. */
  private ordered(): ListHandle[] {
    return [...this.lists.values()].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  }

  /** Every list's rectangle and its entries', read fresh — the page scrolls. */
  private geometry(): ListGeometry[] {
    return this.ordered().map((list) => {
      const rect = list.element.getBoundingClientRect();
      // Its own entries, not a nested section's — and by walking the children
      // rather than by `:scope`, which the test harness's selector engine
      // quietly answers with nothing.
      const items = [...list.element.children].filter((child) =>
        child.classList.contains("sb-item"),
      );
      return {
        section: list.section,
        top: rect.top,
        bottom: rect.bottom,
        items: items.map((item) => {
          const box = item.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom };
        }),
      };
    });
  }

  private publish(next: DragState | null): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

const DragContext = createContext<ItemDragController | null>(null);

export function ItemDragProvider({ children }: { children: ComponentChildren }) {
  const controller = useMemo(() => new ItemDragController(), []);
  return <DragContext.Provider value={controller}>{children}</DragContext.Provider>;
}

export function useItemDrag(): ItemDragController {
  const controller = useContext(DragContext);
  if (!controller) throw new Error("[microbrewery] an entry rendered outside the drag provider");
  return controller;
}

/**
 * One boolean out of the drag's state.
 *
 * Preact bails out of a re-render when a `useState` is set to the value it
 * already has, so a component asking this question only repaints on the two
 * frames where its own answer changes — not on every pointer move.
 */
function useDragFact(pick: (state: DragState | null) => boolean, deps: unknown[]): boolean {
  const controller = useItemDrag();
  const [fact, setFact] = useState(false);
  useLayoutEffect(
    () => controller.subscribe((state) => setFact(pick(state))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, ...deps],
  );
  return fact;
}

/** Whether this gap is where the entry in hand would land. */
export function useDropTarget(section: SectionKey, index: number): boolean {
  return useDragFact(
    (state) => state?.target?.section === section && state.target.index === index,
    [section, index],
  );
}

/** Whether this entry is the one in hand. */
export function useIsDragging(section: SectionKey, id: number): boolean {
  return useDragFact((state) => state?.section === section && state.id === id, [section, id]);
}

/** Whether anything at all is being dragged — the offers stand aside while it is. */
export function useDragActive(): boolean {
  return useDragFact((state) => state !== null, []);
}
