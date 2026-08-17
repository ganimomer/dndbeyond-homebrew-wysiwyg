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

const HOST_ID = "ddb-homebrew-wysiwyg-host";

export class EditorPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private previewMount!: HTMLElement;
  private statusEl!: HTMLElement;
  private unobserve: (() => void) | null = null;
  private rafToken = 0;
  /**
   * Which layout to render. A temporary manual toggle until the page adapter
   * reports the monster's actual ruleset from the form.
   */
  private ruleset: Ruleset = "2024";

  constructor(private readonly adapter: PageAdapter) {
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
    title.textContent = "Homebrew WYSIWYG";

    const toggle = this.buildRulesetToggle();

    const collapse = document.createElement("button");
    collapse.textContent = "–";
    collapse.title = "Collapse";
    collapse.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      collapse.textContent = panel.classList.contains("collapsed") ? "+" : "–";
    });
    header.append(title, toggle, collapse);

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

  /** Segmented 2014 / 2024 toggle that re-renders the preview on change. */
  private buildRulesetToggle(): HTMLElement {
    const group = document.createElement("div");
    group.className = "ruleset-toggle";
    const rulesets: Ruleset[] = ["2014", "2024"];
    for (const rs of rulesets) {
      const btn = document.createElement("button");
      btn.textContent = rs;
      btn.dataset.ruleset = rs;
      btn.title = `Render the ${rs} stat-block layout`;
      if (rs === this.ruleset) btn.classList.add("active");
      btn.addEventListener("click", () => {
        if (this.ruleset === rs) return;
        this.ruleset = rs;
        group.querySelectorAll("button").forEach((b) => {
          b.classList.toggle("active", b.dataset.ruleset === rs);
        });
        this.render();
      });
      group.append(btn);
    }
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
    // Until the adapter reports it from the form, the toggle drives the layout.
    monster.ruleset = this.ruleset;
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
  const parts: string[] = [];
  const total =
    monster.traits.length +
    monster.actions.length +
    monster.bonusActions.length +
    monster.reactions.length +
    monster.legendaryActions.length;
  parts.push(`Live preview of "${monster.name}".`);
  parts.push(`${total} trait/action block${total === 1 ? "" : "s"}.`);
  parts.push("Page fields not wired yet — showing sample/best-effort data.");
  return parts.join(" ");
}
