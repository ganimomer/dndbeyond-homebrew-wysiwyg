/**
 * The comparison the author is reading, for the two components that lay out
 * around it: the overlay (which widens) and the aside (which holds the frame).
 *
 * `lookup-context.tsx`'s shape, published through a subscription for the same
 * reason — nothing that holds a caret should re-render because a panel opened
 * beside it. What differs is what a pick *means*. A lookup ends on one: the
 * reference goes into the prose and the page goes away. A comparison begins on
 * one, and stays open afterwards, because an author who came to take a creature
 * apart rarely wants only one piece of it.
 */
import { createContext, type ComponentChildren } from "preact";
import { useContext, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { LookupPick } from "../lookup/dress-listing.js";
import { motionOk } from "../lookup/motion.js";

/** How long the panel takes to leave, which is how long it stays mounted. */
const EXIT_MS = 240;

export interface CompareState {
  /**
   * `listing` is choosing what to compare against, `monster` is reading one.
   * `closing` is the panel animating away; it is still mounted.
   */
  phase: "listing" | "monster" | "closing";
  /** The creature being read, once one has been chosen. */
  pick: LookupPick | null;
  /**
   * The listing to go back to — D&D Beyond's own URL for it, filters and all.
   *
   * Remembered because the way an author finds the second creature worth
   * cribbing from is the search that found the first, and Back that dropped it
   * would make them type it again every time. Null until they have searched.
   */
  listing: string | null;
}

/** DDB's own page for a picked creature: `/monsters/17043-vampire`. */
export function monsterUrl(pick: LookupPick): string {
  return `/monsters/${pick.id}-${pick.slug}`;
}

export class CompareController {
  private readonly listeners = new Set<(state: CompareState | null) => void>();
  private state: CompareState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Opens on the list. Re-opening while open is a no-op, not a reset. */
  open(): void {
    if (this.state && this.state.phase !== "closing") return;
    this.clearTimer();
    this.publish({ phase: "listing", pick: null, listing: null });
  }

  /**
   * A row was clicked. Unlike a lookup's, this is the middle of the gesture.
   *
   * `from` is the listing the row was on, which the frame is the only thing
   * that knows: the author's search happens inside it, as a form submit, and
   * never passes through here.
   */
  pick(pick: LookupPick, from?: string): void {
    if (!this.state || this.state.phase !== "listing") return;
    this.publish({ phase: "monster", pick, listing: from ?? this.state.listing });
  }

  /** Back to the list — the one they were on, not the top of it. */
  back(): void {
    if (!this.state || this.state.phase !== "monster") return;
    this.publish({ ...this.state, phase: "listing", pick: null });
  }

  close(): void {
    if (!this.state || this.state.phase === "closing") return;
    this.publish({ ...this.state, phase: "closing" });
    // Not `transitionend`, which never fires when there is no transition to
    // end. `motionOk` is what keeps the two answers in step.
    this.timer = setTimeout(() => this.publish(null), motionOk() ? EXIT_MS : 0);
  }

  subscribe(listener: (state: CompareState | null) => void): () => void {
    this.listeners.add(listener);
    // At once, so a component mounted mid-comparison knows what it walked into.
    listener(this.state);
    return () => void this.listeners.delete(listener);
  }

  /** Drops a pending unmount, so a closed overlay can't publish into nothing. */
  stop(): void {
    this.clearTimer();
    this.state = null;
    this.listeners.clear();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(next: CompareState | null): void {
    if (next === null) this.clearTimer();
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

const CompareContext = createContext<CompareController | null>(null);

export function CompareProvider({
  controller,
  children,
}: {
  /** A controller to use instead of its own, so a test can drive the panel. */
  controller?: CompareController;
  children: ComponentChildren;
}) {
  const own = useMemo(() => controller ?? new CompareController(), [controller]);
  useLayoutEffect(() => () => own.stop(), [own]);
  return <CompareContext.Provider value={own}>{children}</CompareContext.Provider>;
}

/**
 * The controller, or null where there isn't one — a block rendered outside the
 * overlay is still a stat block, it just has nowhere to put a second one.
 */
export function useCompare(): CompareController | null {
  return useContext(CompareContext);
}

/** What is being compared against, for the components that lay out around it. */
export function useCompareState(): CompareState | null {
  const controller = useCompare();
  const [state, setState] = useState<CompareState | null>(null);
  useLayoutEffect(() => controller?.subscribe(setState), [controller]);
  return controller ? state : null;
}
