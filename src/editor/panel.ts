/**
 * The injected WYSIWYG panel: a shadow-DOM host that shows a live stat-block
 * preview of whatever the page adapter currently reads. The editing surface
 * (toolbar, structured fields) hangs off this same panel as we build it out —
 * for now the headline feature is the live preview.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Monster, Ruleset } from "../statblock/model.js";
import { renderStatBlock } from "../preview/statblock-view.js";
import panelCss from "./panel.css";
import statblock2014Css from "../preview/statblock-2014.css";
import statblock2024Css from "../preview/statblock-2024.css";

const HOST_ID = "microbrewery-panel-host";

export interface EditorPanelOptions {
  /** Called when the user closes the panel (to restore the launcher button). */
  onClose?: () => void;
}

export class EditorPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private previewMount!: HTMLElement;
  private statusEl!: HTMLElement;
  private toggleGroup!: HTMLElement;
  private unobserve: (() => void) | null = null;
  private rafToken = 0;
  /**
   * Manual layout override. `null` follows the monster's own `ruleset` (read
   * from the form); the toggle sets it to force a layout for comparison.
   */
  private ruleset: Ruleset | null = null;

  constructor(
    private readonly adapter: PageAdapter,
    private readonly options: EditorPanelOptions = {},
  ) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.build();
  }

  /** Mounts the panel and starts tracking the page. */
  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
    this.render();
    this.unobserve = this.adapter.observe(() => this.scheduleRender());
  }

  /** Removes the panel and stops tracking. */
  unmount(): void {
    this.unobserve?.();
    this.unobserve = null;
    this.host.remove();
  }

  private build(): void {
    const style = document.createElement("style");
    style.textContent = `${panelCss}\n${statblock2014Css}\n${statblock2024Css}`;
    this.root.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "panel";

    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Microbrewery";

    const toggle = this.buildRulesetToggle();

    const collapse = document.createElement("button");
    collapse.textContent = "–";
    collapse.title = "Collapse";
    collapse.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      collapse.textContent = panel.classList.contains("collapsed") ? "+" : "–";
    });

    const close = document.createElement("button");
    close.textContent = "×";
    close.title = "Close";
    close.addEventListener("click", () => {
      this.unmount();
      this.options.onClose?.();
    });

    header.append(title, toggle, collapse, close);

    const body = document.createElement("div");
    body.className = "panel-body";

    this.statusEl = document.createElement("p");
    this.statusEl.className = "panel-status";

    this.previewMount = document.createElement("div");

    body.append(this.statusEl, this.previewMount);
    panel.append(header, body);
    this.root.appendChild(panel);

    this.makeDraggable(panel, header);
  }

  /**
   * Segmented 2014 / 2024 toggle. It overrides the layout for comparison; the
   * active button reflects the effective ruleset (updated on each render).
   */
  private buildRulesetToggle(): HTMLElement {
    const group = document.createElement("div");
    group.className = "ruleset-toggle";
    const rulesets: Ruleset[] = ["2014", "2024"];
    for (const rs of rulesets) {
      const btn = document.createElement("button");
      btn.textContent = rs;
      btn.dataset.ruleset = rs;
      btn.title = `Render the ${rs} stat-block layout`;
      btn.addEventListener("click", () => {
        this.ruleset = rs;
        this.render();
      });
      group.append(btn);
    }
    this.toggleGroup = group;
    return group;
  }

  /** Coalesces bursts of page mutations into a single render per frame. */
  private scheduleRender(): void {
    if (this.rafToken) return;
    this.rafToken = requestAnimationFrame(() => {
      this.rafToken = 0;
      this.render();
    });
  }

  private render(): void {
    const monster = this.adapter.read();
    if (!monster) {
      this.setStatus("Waiting for the homebrew form to load…");
      return;
    }
    // Follow the monster's own ruleset unless the toggle forces one.
    const effective = this.ruleset ?? monster.ruleset;
    monster.ruleset = effective;
    this.toggleGroup.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.ruleset === effective);
    });
    this.setStatus(statusFor(monster));
    this.previewMount.replaceChildren(renderStatBlock(monster));
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onMove = (e: MouseEvent) => {
      const rect = panel.getBoundingClientRect();
      panel.style.left = `${originLeft + (e.clientX - startX)}px`;
      panel.style.top = `${originTop + (e.clientY - startY)}px`;
      panel.style.right = "auto";
      // Keep the panel from being dragged fully off-screen.
      if (rect.left < 0) panel.style.left = "0px";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    handle.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }
}

function statusFor(monster: Monster): string {
  const label = monster.ruleset === "2024" ? "2024" : "2014";
  return `Live ${label} preview of "${monster.name}" — updates as you edit the form.`;
}
