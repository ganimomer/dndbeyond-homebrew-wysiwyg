/**
 * A small kebab context menu styled after D&D Beyond's Encounters "actions"
 * menu (see context-menu.css). Build it with a list of items and mount its
 * `.element` wherever the trigger should sit; it manages open/close, closing on
 * outside click (via composedPath, so it works across the shadow boundary) and
 * on Escape. The host is responsible for injecting context-menu.css into the
 * same shadow root.
 */
import { el } from "../preview/dom.js";

/** Material UI icon name → its 24×24 path data. */
export type IconName = "loop" | "close";
const ICON_PATHS: Record<IconName, string> = {
  loop: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};

const SVG_NS = "http://www.w3.org/2000/svg";
/** Builds an 18×18 Material icon that inherits its colour from `currentColor`. */
export function makeIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}

export interface MenuItem {
  label: string;
  /** Material UI icon shown before the label. */
  icon?: IconName;
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
