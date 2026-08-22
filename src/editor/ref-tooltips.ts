/**
 * Hovering a reference in the stat block shows D&D Beyond's own definition.
 *
 * Two decisions shape everything here.
 *
 * **The popup lives in the light DOM**, appended to `document.body` rather than
 * into our shadow root. That is where DDB's stylesheet is, so their markup
 * arrives already styled and we author no tooltip design at all. It is also
 * what keeps the popup out of Lexical's sight: its MutationObserver reverts DOM
 * it did not author, and a node inside the editable would be exactly that.
 *
 * **Nothing here touches the token.** `RefNode.updateDOM` re-asserts a `.ref`
 * element's class and data attributes on every reconcile, so a hover class
 * added from JS would be stripped, or would round-trip through the observer and
 * dirty a section that nobody edited. The hover affordance is pure CSS, and the
 * invariant this module holds is: never mutate the editable subtree, never move
 * focus, never `preventDefault`, never dispatch into the editor.
 *
 * The listeners are delegated on the shadow root, which serves both render
 * paths at once — the Lexical editables and the read-only fragments are all in
 * the same tree — and needs no `composedPath`, since retargeting is relative to
 * the listener's own root.
 */
import type { ReferenceSource, RefToken } from "../adapter/types.js";
import { tooltipFragment } from "./tooltip-html.js";
import { tooltipPlacement } from "./tooltip-placement.js";

/** Long enough that a pointer crossing a paragraph asks DDB nothing. */
const OPEN_DELAY_MS = 250;
/** Short; it only covers the flicker between two DOM nodes of one token. */
const CLOSE_DELAY_MS = 120;
/** One above the overlay's own 2147483000. DDB's 9999 would land underneath. */
const Z_INDEX = "2147483001";

export interface RefTooltipsOptions {
  /** Where hovers are watched: the overlay's shadow root. */
  scope: ShadowRoot;
  source: ReferenceSource;
  /** Where the popup goes. The light DOM, for DDB's own stylesheet. */
  container?: HTMLElement;
  openDelayMs?: number;
  closeDelayMs?: number;
}

export class RefTooltips {
  private readonly scope: ShadowRoot;
  private readonly source: ReferenceSource;
  private readonly container: HTMLElement;
  private readonly openDelayMs: number;
  private readonly closeDelayMs: number;

  private popup: HTMLElement | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The token the pointer is on. */
  private hovered: Element | null = null;
  /**
   * Bumped whenever the intent changes. A lookup that settles against a stale
   * generation is dropped — otherwise a slow answer paints a definition for a
   * word the author left three seconds ago.
   */
  private generation = 0;

  constructor(options: RefTooltipsOptions) {
    this.scope = options.scope;
    this.source = options.source;
    this.container = options.container ?? document.body;
    this.openDelayMs = options.openDelayMs ?? OPEN_DELAY_MS;
    this.closeDelayMs = options.closeDelayMs ?? CLOSE_DELAY_MS;
  }

  start(): void {
    this.scope.addEventListener("mouseover", this.onMouseOver);
    this.scope.addEventListener("mouseout", this.onMouseOut);
    // Scroll doesn't bubble, and the overlay — not the document — is what
    // scrolls, so this has to be captured or it would silently never fire. A
    // popup anchored to a rect is wrong the instant the block moves.
    this.scope.addEventListener("scroll", this.onScroll, true);
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  stop(): void {
    this.scope.removeEventListener("mouseover", this.onMouseOver);
    this.scope.removeEventListener("mouseout", this.onMouseOut);
    this.scope.removeEventListener("scroll", this.onScroll, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    this.cancelTimers();
    this.hovered = null;
    this.close();
    this.popup?.remove();
    this.popup = null;
  }

  private readonly onMouseOver = (event: Event) => {
    const token = refUnder(event.target);
    if (!token || token === this.hovered) return;
    this.cancelTimers();
    this.hovered = token;
    this.generation++;
    // Nothing is fetched yet. A pointer sweeping a line of prose crosses a
    // dozen tokens and should cost a dozen timers, not a dozen requests.
    this.openTimer = setTimeout(() => void this.open(token, this.generation), this.openDelayMs);
  };

  private readonly onMouseOut = (event: Event) => {
    const token = refUnder(event.target);
    if (!token || token !== this.hovered) return;
    // A token can be several elements (Lexical splits on formatting), so a
    // crossing between them is not a departure.
    const to = (event as MouseEvent).relatedTarget;
    if (to instanceof Node && token.contains(to)) return;
    this.cancelTimers();
    this.hovered = null;
    this.generation++;
    this.closeTimer = setTimeout(() => this.close(), this.closeDelayMs);
  };

  private readonly onScroll = () => this.dismiss();
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.dismiss();
  };

  /** Close now, and don't let an in-flight lookup reopen behind us. */
  private dismiss(): void {
    this.cancelTimers();
    this.hovered = null;
    this.generation++;
    this.close();
  }

  private async open(token: Element, generation: number): Promise<void> {
    const tooltip = await this.source.lookup(readToken(token));
    // Two ways to be stale: the intent changed, or the pointer moved on while
    // the request was out.
    if (!tooltip || generation !== this.generation || this.hovered !== token) return;

    const popup = this.ensurePopup();
    const body = popup.firstElementChild as HTMLElement;
    body.replaceChildren(tooltipFragment(tooltip.html));

    // Measure hidden, place, then reveal — one forced layout per open, and no
    // frame where the popup is visible in the wrong place.
    popup.style.visibility = "hidden";
    popup.style.display = "block";
    popup.style.left = "0px";
    popup.style.top = "0px";
    const { left, top } = tooltipPlacement(
      token.getBoundingClientRect(),
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.visibility = "visible";
  }

  private close(): void {
    if (!this.popup) return;
    this.popup.style.display = "none";
    (this.popup.firstElementChild as HTMLElement | null)?.replaceChildren();
  }

  private cancelTimers(): void {
    if (this.openTimer !== null) clearTimeout(this.openTimer);
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.openTimer = null;
    this.closeTimer = null;
  }

  private ensurePopup(): HTMLElement {
    if (this.popup) return this.popup;
    const popup = document.createElement("div");
    // `waterdeep-tooltip` is the class DDB's own container carries, and what
    // their stylesheet keys on. The id is ours — `db-tooltip-container` is
    // CurseTip's singleton, and we are not going to fight it for the name.
    popup.id = "microbrewery-tooltip";
    popup.className = "waterdeep-tooltip";
    popup.setAttribute("role", "tooltip");
    // `pointer-events: none` is the load-bearing line: the popup can never
    // become a mouse target, steal the hover from the text beneath it, or take
    // a click that would move the caret out of the editable. DDB's own tooltips
    // make the same trade — the links inside them don't work there either.
    //
    // The rest is a plain readable box, so that if DDB ever renames the class
    // this degrades to something legible rather than unstyled sprawl.
    popup.style.cssText = [
      "position: fixed",
      `z-index: ${Z_INDEX}`,
      "pointer-events: none",
      "display: none",
      // Above DDB's own 775px cap, so their layout is never the thing clipped,
      // and no border — theirs draws the frame, and ours would ring it.
      "max-width: min(800px, calc(100vw - 16px))",
      "background: #fff",
      "box-shadow: 0 2px 24px rgba(0, 0, 0, 0.35)",
      "color: #1c1c1c",
      "font: 14px/1.5 system-ui, sans-serif",
    ].join("; ");
    // DDB's own container is `<h3 hidden> + <div class="body"> + <div class="url">`;
    // the body is the part their rules reach into, and the only part we need.
    const body = document.createElement("div");
    body.className = "body";
    popup.appendChild(body);
    this.container.appendChild(popup);
    this.popup = popup;
    return popup;
  }
}

/** The `.ref` element an event landed on, if any. */
function refUnder(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(".ref") : null;
}

/** A token as the DOM carries it — the three attributes `RefNode` writes. */
function readToken(element: Element): RefToken {
  return {
    ref: element.getAttribute("data-ref") ?? "",
    slug: element.getAttribute("data-slug") ?? undefined,
    text: element.textContent ?? "",
  };
}
