/**
 * A small kebab context menu styled after D&D Beyond's Encounters "actions"
 * menu (see context-menu.css). Build it with a list of items and mount its
 * `.element` wherever the trigger should sit; it manages open/close, closing on
 * outside click (via composedPath, so it works across the shadow boundary) and
 * on Escape. The host is responsible for injecting context-menu.css into the
 * same shadow root.
 */
import { el } from "../preview/dom.js";

export interface MenuItem {
  label: string;
  /** Shows a check and bolds the row (e.g. the current ruleset). */
  active?: boolean;
  /** Renders the icon in a warning colour (e.g. Close). */
  danger?: boolean;
  onClick: () => void;
}

export class ContextMenu {
  readonly element: HTMLElement;
  private isOpen = false;

  private readonly onOutside = (e: Event) => {
    if (this.isOpen && !e.composedPath().includes(this.element)) this.close();
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  constructor(items: MenuItem[]) {
    this.element = el("div", "cm");

    const trigger = el("button", "cm-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Options");
    trigger.textContent = "⋮";
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const list = el("ul", "cm-menu");
    for (const item of items) {
      const li = el("li", "cm-item");
      if (item.active) li.classList.add("active");
      if (item.danger) li.classList.add("danger");

      const icon = el("span", "cm-icon");
      icon.textContent = item.danger ? "✕" : item.active ? "✓" : "";

      const label = el("span", "cm-label");
      label.textContent = item.label;

      li.append(icon, label);
      li.addEventListener("click", () => {
        this.close();
        item.onClick();
      });
      list.append(li);
    }

    this.element.append(trigger, list);
  }

  private toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private open(): void {
    this.isOpen = true;
    this.element.classList.add("open");
    window.addEventListener("click", this.onOutside, true);
    window.addEventListener("keydown", this.onKey, true);
  }

  close(): void {
    this.isOpen = false;
    this.element.classList.remove("open");
    window.removeEventListener("click", this.onOutside, true);
    window.removeEventListener("keydown", this.onKey, true);
  }

  /** Detaches listeners; call before discarding the menu. */
  destroy(): void {
    this.close();
  }
}
