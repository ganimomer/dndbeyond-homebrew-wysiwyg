/**
 * A small kebab context menu styled after D&D Beyond's Encounters "actions"
 * menu (see context-menu.css). Build it with a list of items and mount its
 * `.element` wherever the trigger should sit; it manages open/close, closing on
 * outside click (via composedPath, so it works across the shadow boundary) and
 * on Escape. The host is responsible for injecting context-menu.css into the
 * same shadow root.
 */
import { el } from "../preview/dom.js";
// Icons live in preview/ because the renderers need them too; re-exported here
// so this module stays the one import for building a menu.
export { makeIcon, type IconName } from "../preview/icons.js";
import { makeIcon, type IconName } from "../preview/icons.js";

export interface MenuItem {
  label: string;
  /** Material UI icon shown before the label. */
  icon?: IconName;
  /** Renders the icon in a warning colour (e.g. Close). */
  danger?: boolean;
  onClick: () => void;
}

export interface ContextMenuOptions {
  /** Trigger glyph; defaults to the kebab "⋮" when there's no icon either. */
  triggerText?: string;
  /** Material icon shown before the trigger's text, e.g. the "Add…" plus. */
  triggerIcon?: IconName;
  triggerLabel?: string;
  /** Extra class on the trigger, e.g. to reuse the chip "＋" styling. */
  triggerClass?: string;
  /** Extra class on the popover, e.g. "compact" for a long list. */
  menuClass?: string;
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

  constructor(items: MenuItem[], options: ContextMenuOptions = {}) {
    this.element = el("div", "cm");

    const trigger = el("button", "cm-trigger");
    if (options.triggerClass) trigger.classList.add(options.triggerClass);
    trigger.type = "button";
    trigger.setAttribute("aria-label", options.triggerLabel ?? "Options");
    const label = options.triggerText ?? (options.triggerIcon ? "" : "⋮");
    if (options.triggerIcon) trigger.append(makeIcon(options.triggerIcon, 16));
    if (label) trigger.append(label);
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const list = el("ul", "cm-menu");
    if (options.menuClass) list.classList.add(options.menuClass);
    for (const item of items) {
      const li = el("li", "cm-item");
      if (item.danger) li.classList.add("danger");

      const icon = el("span", "cm-icon");
      if (item.icon) icon.appendChild(makeIcon(item.icon));

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
