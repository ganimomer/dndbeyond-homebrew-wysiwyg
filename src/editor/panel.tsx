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
import "../ui/sync-rendering.js";
import type { DdbReferenceSource } from "../adapter/ddb-references.js";
import { flushReferenceIds, pageReferenceSource } from "../adapter/reference-source.js";
import type { PageAdapter } from "../adapter/types.js";
import { App } from "../ui/App.js";
import { RefPreloader } from "./ref-preload.js";
import { RefTooltips } from "./ref-tooltips.js";

const HOST_ID = "microbrewery-panel-host";

export interface EditorPanelOptions {
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export class EditorPanel {
  private readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  /**
   * Hover definitions. They belong here rather than in the tree because the
   * popup goes in the *light* DOM — outside the shadow root, where D&D
   * Beyond's own tooltip styles are — so it can't be a component.
   */
  private readonly source: DdbReferenceSource;
  private readonly tooltips: RefTooltips;
  private readonly preloader: RefPreloader;

  constructor(
    private readonly adapter: PageAdapter,
    private readonly options: EditorPanelOptions = {},
  ) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.source = pageReferenceSource();
    this.tooltips = new RefTooltips({ scope: this.root, source: this.source });
    this.preloader = new RefPreloader({ scope: this.root, source: this.source });
  }

  /** Puts the overlay on the page. */
  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
    // Freeze the page underneath so only the overlay scrolls.
    document.documentElement.style.overflow = "hidden";
    render(<App adapter={this.adapter} onClose={this.close} />, this.root);
    this.tooltips.start();
    // Resolving a reference the shipped table doesn't cover costs about a
    // second, so the block warms itself while the author is still reading it.
    this.preloader.start();
  }

  /** Takes it off again. */
  unmount(): void {
    // Preact runs the tree's cleanups synchronously as it unmounts, which is
    // what stops the controller observing the form and flushes a save still
    // sitting inside its debounce.
    // Before the tree goes, so the popup and its listeners leave with it.
    this.preloader.stop();
    this.tooltips.stop();
    // Nothing is waiting on a preload for a panel that is closing.
    this.source.dropPending();
    void flushReferenceIds();
    render(null, this.root);
    document.documentElement.style.overflow = "";
    this.host.remove();
  }

  private readonly close = () => this.options.onClose?.();
}
