/**
 * The one place a question asked inside an entry can be answered by a whole
 * page.
 *
 * Adding a spell reference starts in a menu floating over one trait and ends in
 * D&D Beyond's browse page, which lives in the artwork's column at the other
 * side of the block. The two have no ancestor in common that isn't the whole
 * document, so — like `prose/drag-context.tsx`, which solves the same shape of
 * problem for an entry dragged between sections — the request is registered
 * here and answered from above.
 *
 * Published through a subscription rather than as context state: the two
 * components that care are the overlay (which shifts) and the aside (which
 * holds the frame), and neither is an editor. Nothing that holds a caret
 * re-renders because a lookup opened.
 */
import { createContext, type ComponentChildren } from "preact";
import { useContext, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { ReferenceKind } from "../../adapter/reference-catalog.js";
import { rememberReferenceId } from "../../adapter/reference-source.js";
import type { LookupPick } from "./dress-listing.js";
import { motionOk } from "./motion.js";

/** How long the frame takes to leave, which is how long it stays mounted. */
const EXIT_MS = 240;

export interface LookupRequest {
  /** What is being looked up. Its `path` is also DDB's own listing URL. */
  kind: ReferenceKind;
  /** What the author had typed, which seeds D&D Beyond's own search box. */
  query: string;
  onPick(pick: LookupPick): void;
  /** Closed without picking: the reference is abandoned. */
  onCancel(): void;
}

export interface LookupState {
  request: LookupRequest;
  /** `closing` is the frame animating away; it is still mounted. */
  phase: "open" | "closing";
}

export class LookupController {
  private readonly listeners = new Set<(state: LookupState | null) => void>();
  private state: LookupState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  open(request: LookupRequest): void {
    this.clearTimer();
    this.publish({ request, phase: "open" });
  }

  /** A row was clicked. The reference goes in, and the page goes away. */
  pick(pick: LookupPick): void {
    const open = this.live;
    if (!open) return;
    // The row carried the id, and the id is the expensive half of a tooltip —
    // an unknown name otherwise costs a redirect through a whole rendered page.
    // It also says *which* spell: a legacy one and its 2024 replacement share a
    // name and a slug, and differ only here.
    rememberReferenceId({ path: open.kind.path, slug: pick.slug }, pick.id);
    open.onPick(pick);
    this.dismiss();
  }

  cancel(): void {
    const open = this.live;
    if (!open) return;
    open.onCancel();
    this.dismiss();
  }

  /**
   * The request, only while it is still taking answers. A dismissed lookup is
   * on screen for as long as it takes to fade, and a second click in that time
   * would otherwise insert a second reference.
   */
  private get live(): LookupRequest | null {
    return this.state?.phase === "open" ? this.state.request : null;
  }

  subscribe(listener: (state: LookupState | null) => void): () => void {
    this.listeners.add(listener);
    // At once, so a component mounted mid-lookup knows what it has walked into.
    listener(this.state);
    return () => void this.listeners.delete(listener);
  }

  /** Drops a pending unmount, so a closed overlay can't publish into nothing. */
  stop(): void {
    this.clearTimer();
    this.state = null;
    this.listeners.clear();
  }

  /**
   * Starts the frame leaving. The overlay reads `open` and so shifts back at
   * once, while the frame fades out beside it — the two moves run together
   * rather than one after the other.
   */
  private dismiss(): void {
    if (!this.state) return;
    this.publish({ ...this.state, phase: "closing" });
    // Not `transitionend`, which never fires when there is no transition to
    // end. `motionOk` is what keeps the two answers in step.
    this.timer = setTimeout(() => this.publish(null), motionOk() ? EXIT_MS : 0);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(next: LookupState | null): void {
    if (next === null) this.clearTimer();
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}

const LookupContext = createContext<LookupController | null>(null);

export function LookupProvider({
  controller,
  children,
}: {
  /** A controller to use instead of its own, so a test can drive the lookup. */
  controller?: LookupController;
  children: ComponentChildren;
}) {
  const own = useMemo(() => controller ?? new LookupController(), [controller]);
  useLayoutEffect(() => () => own.stop(), [own]);
  return <LookupContext.Provider value={own}>{children}</LookupContext.Provider>;
}

/**
 * The controller, or null where there isn't one.
 *
 * Null rather than a throw, unlike the drag context: an entry rendered on its
 * own is still a working editor and can still name a spell — it just has
 * nowhere to browse for one, so it doesn't offer to.
 */
export function useLookup(): LookupController | null {
  return useContext(LookupContext);
}

/** What is being looked up, for the two components that lay out around it. */
export function useLookupState(): LookupState | null {
  const controller = useLookup();
  const [state, setState] = useState<LookupState | null>(null);
  useLayoutEffect(() => controller?.subscribe(setState), [controller]);
  return controller ? state : null;
}
