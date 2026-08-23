/**
 * D&D Beyond's own browse page, in the artwork's place.
 *
 * It is their page, not a copy of one: an `<iframe>` at the same origin,
 * carrying the author's own session, so what it lists is exactly what they own.
 * `dress-listing.ts` cuts it down to a picker; this puts it on the block and
 * takes it off again.
 *
 * **The cover is load-bearing.** Searching inside the frame is a plain form
 * submit, so every search is a whole new document — undressed, navigation bar
 * and all, until `load` fires and the surgery runs again. So the frame is
 * covered from the moment a navigation starts until the page it lands on has
 * been cut down, which the frame's own `beforeunload` is what tells us (readable
 * from out here only because the two are same-origin).
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ReferenceKind } from "../../adapter/reference-catalog.js";
import { dressListing } from "./dress-listing.js";
import { useLookup, type LookupState } from "./lookup-context.js";

/**
 * DDB's own browse URL, already searched for whatever the author typed.
 *
 * Usually the compendium's own path. `listing` is for the one that isn't:
 * gear, armor and weapons are three compendiums browsed at one `/equipment`.
 */
export function listingUrl(kind: ReferenceKind, query: string): string {
  const path = `/${kind.listing ?? kind.path}`;
  return query ? `${path}?filter-search=${encodeURIComponent(query)}` : path;
}

export function LookupFrame({ state }: { state: LookupState }) {
  const lookup = useLookup();
  const frame = useRef<HTMLIFrameElement>(null);
  const dressed = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Whether it has been on screen for a frame. The panel mounts in its
   * off-screen state and is moved a paint later, because a transition from a
   * style that was never rendered doesn't run.
   */
  const [arrived, setArrived] = useState(false);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Whatever this leaves behind belongs to a document that is about to be
  // thrown away, but the listeners are ours and the panel outlives one page.
  useLayoutEffect(() => () => dressed.current?.(), []);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc || !lookup) return;
    dressed.current?.();
    dressed.current = dressListing(doc, {
      onPick: (pick) => lookup.pick(pick),
      onClose: () => lookup.cancel(),
    });
    // The next search, re-raising the cover before its page can paint.
    doc.defaultView?.addEventListener("beforeunload", () => setLoading(true));
    setLoading(false);
  };

  const { kind, query } = state.request;
  return (
    <div class={arrived && state.phase === "open" ? "lf is-open" : "lf"}>
      <iframe
        ref={frame}
        class="lf-frame"
        // Not the label pluralised: "Equipment" has no plural, and "Equipments"
        // is the sort of thing only a template produces.
        title={`${kind.label} search on D&D Beyond`}
        src={listingUrl(kind, query)}
        onLoad={onLoad}
      />
      {loading ? (
        <div class="lf-cover">
          <span class="save-spinner" role="status" aria-label="Loading" />
        </div>
      ) : null}
    </div>
  );
}
