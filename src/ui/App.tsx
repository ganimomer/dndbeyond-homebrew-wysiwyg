/**
 * The editor overlay's root.
 *
 * It owns the shadow root's stylesheet, the backdrop, the scrolling page, and
 * the one subscription to the store: everything below reads through
 * `store-context`, so a change re-renders the tree and Preact works out what
 * actually moved.
 *
 * The two kinds of change want different timing, which is why the store says
 * which it was. Form mutations arrive in bursts — one edit can touch four
 * fields — so they coalesce into a frame. Session changes must not: a
 * mini-form's click-away depends on the re-render landing inside the click that
 * caused it, while that click is still in its capture phase.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PageAdapter } from "../adapter/types.js";
import { EditorStore } from "../state/store.js";
import { applyDependencyHighlights } from "../editor/dependency-highlights.js";
import { applySaveState } from "../editor/save-indicator.js";
import { StoreContext } from "./store-context.js";
import { StatBlock } from "./StatBlock.js";
import panelCss from "../editor/panel.css";
import contextMenuCss from "../editor/context-menu.css";
import optionPickerCss from "../editor/option-picker.css";
import statblock5eCss from "../preview/statblock-5e.css";
import statblock55eCss from "../preview/statblock-55e.css";

/**
 * One stylesheet for the whole shadow root. Rendered as part of the tree rather
 * than appended alongside it, so Preact owns every node under the root and
 * nothing it diffs can trip over a stray sibling.
 */
const STYLES = [panelCss, contextMenuCss, optionPickerCss, statblock5eCss, statblock55eCss].join(
  "\n",
);

export interface AppProps {
  adapter: PageAdapter;
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export function App({ adapter, onClose }: AppProps) {
  // Started as it is created, not in the effect below: the very first render
  // has to have the creature in hand. Reading the form is what the store is
  // for, and the overlay is never built without one.
  const store = useMemo(() => {
    const created = new EditorStore(adapter);
    created.start();
    return created;
  }, [adapter]);
  const [, repaint] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const unsubscribe = store.subscribe((change) => {
      if (change === "session") {
        repaint((n) => n + 1);
        return;
      }
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        repaint((n) => n + 1);
      });
    });
    // Best-effort flush when the tab goes away mid-debounce. The save is far
    // too large for `keepalive`, so an immediate unload can still cut it off —
    // but DDB puts up its own unsaved-changes prompt, which usually buys enough
    // time.
    const onBeforeUnload = () => void store.autosave.flush();
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (frame.current) cancelAnimationFrame(frame.current);
      store.stop();
    };
  }, [store]);

  // Saves land on their own schedule — a request starting or finishing doesn't
  // touch the form — so the indicators are painted directly rather than through
  // a re-render.
  useLayoutEffect(() => {
    return store.autosave.onStateChange((state) => {
      if (stage.current) applySaveState(stage.current, state, () => store.autosave.retry());
    });
  }, [store]);

  const monster = store.getMonster();

  // Two passes over the finished block that belong to no single field: the
  // dependency flags a score change leaves across the whole thing, and the
  // save indicator repainted onto freshly rendered slots.
  useLayoutEffect(() => {
    if (!stage.current || !monster) return;
    applyDependencyHighlights(stage.current, store.getSession().changedAbilities);
    applySaveState(stage.current, store.autosave.state, () => store.autosave.retry());
  });

  return (
    <StoreContext.Provider value={store}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div class="overlay">
        <div class="page">
          <div class="stage" ref={stage}>
            {monster ? <StatBlock monster={monster} onClose={onClose} /> : null}
          </div>
        </div>
      </div>
    </StoreContext.Provider>
  );
}
