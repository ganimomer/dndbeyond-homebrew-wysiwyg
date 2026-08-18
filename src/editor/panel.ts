/**
 * The full-page editor overlay. Opened from the launcher, it covers the D&D
 * Beyond homebrew form with a stat block that looks like the monster outside
 * edit mode (artwork + all sections), and carries an Encounters-style context
 * menu on the name row for switching ruleset or closing back to the form.
 *
 * Everything lives in one shadow root so DDB's page styles can't leak in.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Ability, Monster } from "../statblock/model.js";
import { renderStatBlock } from "../preview/statblock-view.js";
import { ContextMenu, makeIcon } from "./context-menu.js";
import { applyDependencyHighlights, wireAbilityInputs } from "./ability-editing.js";
import { ProseEditor } from "./prose-editor.js";
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
  /**
   * The live editor for the Traits section (the first prose section wired for
   * editing). Persists across re-renders — its host is re-parented into each
   * freshly rendered block rather than rebuilt, so the caret and undo survive.
   */
  private traitsEditor: ProseEditor | null = null;
  private traitsHost: HTMLElement | null = null;

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
    this.traitsEditor?.destroy();
    this.traitsEditor = null;
    this.traitsHost = null;
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
    // A form mutation while the traits editor holds focus is almost always our
    // own debounced write-back echoing back through observe(). Rebuilding now
    // would re-parent the focused editor and disturb the caret, so skip it; the
    // chrome re-syncs on the next render once editing pauses.
    if (this.traitsEditor?.hasFocus()) return;

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

    // Mount after the block is attached so Lexical binds to a connected node.
    this.mountTraitsEditor(block, monster);
  }

  /**
   * Makes the Traits section editable: swaps its read-only body for a persistent
   * Lexical editor host. The host and editor are created once and re-parented
   * into each freshly rendered block, so form-driven re-renders never tear the
   * editor down. When the section is present but unfocused, its content is
   * re-synced from the form; the focus guard in render() covers the focused case.
   *
   * This is the narrow proof of the editable-prose architecture; the remaining
   * sections and the lit-html view conversion build on the same seam.
   */
  private mountTraitsEditor(block: ParentNode, monster: Monster): void {
    const holder = block.querySelector<HTMLElement>('[data-section="traits"]');
    if (!holder) return; // no traits body to edit (empty section)
    const initialHtml = monster.descriptionHtml?.traits ?? "";

    if (!this.traitsEditor || !this.traitsHost) {
      this.traitsHost = document.createElement("div");
      this.traitsHost.className = "sb-prose";
      holder.replaceChildren(this.traitsHost);
      this.traitsEditor = new ProseEditor({
        section: "traits",
        initialHtml,
        onCommit: (section, html) => this.adapter.setDescription(section, html),
      });
      this.traitsEditor.mount(this.traitsHost);
      return;
    }

    // Reuse the existing editor: re-parent its host into the new block. Only
    // re-sync content when the user isn't mid-edit (they aren't — render() bails
    // early while focused).
    holder.replaceChildren(this.traitsHost);
    this.traitsEditor.setContent(initialHtml);
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
