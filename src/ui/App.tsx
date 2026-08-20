/**
 * The editor overlay's root component.
 *
 * It owns everything above the stat block: the stylesheet the shadow root
 * carries, the overlay backdrop, and the scrolling page the block sits on. The
 * block itself is still drawn by `StatBlockController`, into a container this
 * component owns — the one seam left between the Preact tree and the render
 * loop it is replacing. Fields move across it one at a time; when the last one
 * has, the container and the controller both go.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import type { PageAdapter } from "../adapter/types.js";
import { StatBlockController } from "../editor/statblock-controller.js";
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
  const stage = useRef<HTMLDivElement>(null);

  // A layout effect, not an ordinary one: the block has to be in the DOM by the
  // time the mounting render returns, the way it was when the panel built it
  // by hand. `onClose` is stable for the overlay's lifetime, so the controller
  // is created once per adapter and not restarted underneath itself.
  useLayoutEffect(() => {
    const controller = new StatBlockController(adapter, stage.current!, { onClose });
    controller.start();
    return () => controller.stop();
  }, [adapter]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div class="overlay">
        <div class="page">
          <div class="stage" ref={stage} />
        </div>
      </div>
    </>
  );
}
