/**
 * A D&D Beyond page of their own, standing in the artwork's column.
 *
 * It is their page, not a copy of one: an `<iframe>` at the same origin,
 * carrying the author's own session, so what it shows is exactly what they can
 * see. What the frame is *for* belongs to whoever mounts it — a listing cut
 * down to a picker, a stat block cut into importable entries — and arrives as
 * `dress`, which is run against the loaded document and returns its own
 * undoer. Everything here is the part both of those need identically.
 *
 * **The cover is load-bearing.** Navigating inside the frame — a search's form
 * submit, a row that changes the page — lands a whole new document, undressed,
 * navigation bar and all, until `load` fires and the surgery runs again. So the
 * frame is covered from the moment a navigation starts until the page it lands
 * on has been cut down, which the frame's own `beforeunload` is what tells us
 * (readable from out here only because the two are same-origin).
 */
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

export interface SideFrameProps {
  /** The page to show. Changing it navigates the frame in place. */
  src: string;
  /** The frame's accessible name. */
  title: string;
  /** False while the panel is leaving, which is what fades it out. */
  open: boolean;
  /** Cuts the loaded page down to what the panel is for; returns its undoer. */
  dress: (doc: Document) => () => void;
  /**
   * What to say when the page that arrived isn't ours to read.
   *
   * D&D Beyond answers a request for something the author hasn't got with a
   * redirect to its marketplace, which is a different origin — so the frame
   * loads, and nothing in it can be reached. Without this the cover would sit
   * there spinning over a page that had already finished arriving.
   */
  blocked?: ComponentChildren;
  /** Extra class on the panel, for a feature that wants its own dressing. */
  class?: string;
}

export function SideFrame({ src, title, open, dress, blocked, class: extra }: SideFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const dressed = useRef<(() => void) | null>(null);
  /** Held in a ref so a re-dress after a load never runs a stale closure. */
  const latest = useRef(dress);
  latest.current = dress;
  const [loading, setLoading] = useState(true);
  /** Whether the page that arrived turned out to be someone else's origin. */
  const [barred, setBarred] = useState(false);
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

  // A changed `src` is a navigation, and a navigation is an undressed page for
  // as long as it takes to arrive. Raising the cover here rather than waiting
  // for `beforeunload` is what covers the very first one too.
  useLayoutEffect(() => {
    setLoading(true);
    setBarred(false);
  }, [src]);

  const onLoad = () => {
    // Lowered whatever arrived: a cover that never lifts reads as a hang, and
    // the one page we cannot dress is exactly the one we most need to explain.
    setLoading(false);
    dressed.current?.();
    dressed.current = null;
    let doc: Document | null = null;
    try {
      doc = frame.current?.contentDocument ?? null;
    } catch {
      doc = null; // A cross-origin document, told the other way round.
    }
    if (!doc) {
      setBarred(true);
      return;
    }
    setBarred(false);
    dressed.current = latest.current(doc);
    // The next navigation, re-raising the cover before its page can paint.
    doc.defaultView?.addEventListener("beforeunload", () => setLoading(true));
  };

  const base = extra ? `sf ${extra}` : "sf";
  return (
    <div class={arrived && open ? `${base} is-open` : base}>
      <iframe ref={frame} class="sf-frame" title={title} src={src} onLoad={onLoad} />
      {loading ? (
        <div class="sf-cover">
          <span class="save-spinner" role="status" aria-label="Loading" />
        </div>
      ) : null}
      {barred && blocked ? <div class="sf-cover sf-barred">{blocked}</div> : null}
    </div>
  );
}
