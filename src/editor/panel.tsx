/**
 * The overlay's host on D&D Beyond's page: one element, one shadow root, and a
 * Preact tree inside it.
 *
 * The shadow root is what keeps DDB's stylesheet out of the stat block and ours
 * off their page. Everything else — the chrome, the block, the editing — lives
 * in the tree; this is only the thing that puts it on the page and takes it off
 * again.
 */
import { render } from "preact";
import type { PageAdapter } from "../adapter/types.js";
import { App } from "../ui/App.js";

const HOST_ID = "microbrewery-panel-host";

export interface EditorPanelOptions {
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export class EditorPanel {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;

  constructor(
    private readonly adapter: PageAdapter,
    private readonly options: EditorPanelOptions = {},
  ) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
  }

  /** Puts the overlay on the page. */
  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
    // Freeze the page underneath so only the overlay scrolls.
    document.documentElement.style.overflow = "hidden";
    render(<App adapter={this.adapter} onClose={this.close} />, this.root);
  }

  /** Takes it off again. */
  unmount(): void {
    // Preact runs the tree's cleanups synchronously as it unmounts, which is
    // what stops the controller observing the form and flushes a save still
    // sitting inside its debounce.
    render(null, this.root);
    document.documentElement.style.overflow = "";
    this.host.remove();
  }

  private readonly close = () => this.options.onClose?.();
}
