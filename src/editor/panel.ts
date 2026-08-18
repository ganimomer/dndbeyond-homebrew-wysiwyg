/**
 * The full-page editor overlay. Opened from the launcher, it covers the D&D
 * Beyond homebrew form with a stat block that looks like the monster outside
 * edit mode (artwork + all sections), and carries an Encounters-style context
 * menu on the name row for switching ruleset or closing back to the form.
 *
 * Everything lives in one shadow root so DDB's page styles can't leak in.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Ability } from "../statblock/model.js";
import { renderStatBlock } from "../preview/statblock-view.js";
import { ContextMenu, makeIcon } from "./context-menu.js";
import { applyDependencyHighlights, wireAbilityInputs } from "./ability-editing.js";
import panelCss from "./panel.css";
import contextMenuCss from "./context-menu.css";
import statblock5eCss from "../preview/statblock-5e.css";
import statblock55eCss from "../preview/statblock-55e.css";

const HOST_ID = "microbrewery-panel-host";

export interface EditorPanelOptions {
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export class EditorPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private stage!: HTMLElement;
  private unobserve: (() => void) | null = null;
  private rafToken = 0;
  private menu: ContextMenu | null = null;
  /** Abilities the user has edited this session; drives dependency highlights. */
  private changedAbilities = new Set<Ability>();

  constructor(
    private readonly adapter: PageAdapter,
    private readonly options: EditorPanelOptions = {},
  ) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.build();
  }

  /** Mounts the overlay and starts tracking the form. */
  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
    // Freeze the page underneath so only the overlay scrolls.
    document.documentElement.style.overflow = "hidden";
    this.render();
    this.unobserve = this.adapter.observe(() => this.scheduleRender());
  }

  /** Removes the overlay and stops tracking. */
  unmount(): void {
    this.unobserve?.();
    this.unobserve = null;
    this.menu?.destroy();
    this.menu = null;
    document.documentElement.style.overflow = "";
    this.host.remove();
  }

  private close(): void {
    this.unmount();
    this.options.onClose?.();
  }

  private build(): void {
    const style = document.createElement("style");
    style.textContent = [panelCss, contextMenuCss, statblock5eCss, statblock55eCss].join("\n");
    this.root.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const page = document.createElement("div");
    page.className = "page";
    this.stage = document.createElement("div");
    this.stage.className = "stage";
    page.appendChild(this.stage);
    overlay.appendChild(page);
    this.root.appendChild(overlay);
  }

  /** Coalesces bursts of form mutations into a single render per frame. */
  private scheduleRender(): void {
    if (this.rafToken) return;
    this.rafToken = requestAnimationFrame(() => {
      this.rafToken = 0;
      this.render();
    });
  }

  private render(): void {
    const monster = this.adapter.read();
    if (!monster) return;

    this.menu?.destroy();
    const block = renderStatBlock(monster);

    const slot = block.querySelector<HTMLElement>(".name-menu");
    if (slot) {
      // Offer only the layout we're not currently in.
      const other = monster.ruleset === "5e" ? "5.5e" : "5e";
      this.menu = new ContextMenu([
        {
          label: `Use ${other} stat block`,
          icon: "loop",
          onClick: () => this.adapter.setRuleset(other),
        },
      ]);
      // Close is a standalone icon button, pinned to the far right of the row.
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "name-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.append(makeIcon("close"));
      closeBtn.addEventListener("click", () => this.close());
      slot.append(this.menu.element, closeBtn);
    }

    // Editing an ability writes it back (which re-renders via observe) and
    // records it so its dependents stay flagged across renders.
    wireAbilityInputs(block, monster, (ability, score) => {
      this.changedAbilities.add(ability);
      this.adapter.setAbility(ability, score);
    });
    applyDependencyHighlights(block, this.changedAbilities);

    // Preserve caret focus across the blur→re-render so tabbing between ability
    // inputs stays usable.
    const focusedAbility = this.focusedAbility();
    this.stage.replaceChildren(block);
    this.restoreFocus(block, focusedAbility);
  }

  /** The ability whose score input currently holds focus, if any. */
  private focusedAbility(): string | null {
    const active = this.root.activeElement as HTMLElement | null;
    return active?.classList.contains("score-input")
      ? (active.dataset.ability ?? null)
      : null;
  }

  private restoreFocus(scope: ParentNode, ability: string | null): void {
    if (!ability) return;
    const input = scope.querySelector<HTMLInputElement>(
      `.score-input[data-ability="${ability}"]`,
    );
    input?.focus();
  }
}
