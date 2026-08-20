/**
 * The "＋" that adds a value to a chip row: a popover whose first control is a
 * filter box, so picking one of eighteen skills is three keystrokes rather than
 * a scan down a scrolling list.
 *
 * Deliberately not a `ContextMenu`. That one is D&D Beyond's kebab "actions"
 * menu — a handful of icon-labelled commands, mouse-driven, Escape its whole
 * keyboard model. This is a single-select over a long list of like-shaped
 * options, so it gets the combobox treatment instead: autofocused filter,
 * ↑/↓ over a highlight, Enter to take it. The host injects chip-picker.css into
 * the same shadow root.
 */
import { el } from "../preview/dom.js";
import { closeOnOutsideClick } from "./mini-form.js";

export interface PickerOption {
  label: string;
  onClick: () => void;
}

export interface ChipPickerOptions {
  /** Names the control for screen readers, e.g. "Add sense". */
  label: string;
  /** Filter placeholder; defaults to "Filter…". */
  placeholder?: string;
}

/** Ids only have to be unique within the document, and aria-activedescendant needs them. */
let nextId = 0;

export class ChipPicker {
  readonly element: HTMLElement;

  private readonly trigger: HTMLButtonElement;
  private readonly filter: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  /** The options in source order, each with the `li` painting it. */
  private readonly rows: { option: PickerOption; li: HTMLElement }[] = [];

  private isOpen = false;
  /** Index into `rows` of the highlighted option, or -1 when nothing matches. */
  private active = -1;
  private detachOutside: (() => void) | null = null;

  constructor(options: PickerOption[], { label, placeholder }: ChipPickerOptions) {
    const id = `cp-${nextId++}`;
    this.element = el("div", "cp");

    this.trigger = el("button", "cp-trigger");
    this.trigger.type = "button";
    this.trigger.setAttribute("aria-label", label);
    this.trigger.textContent = "+";
    this.trigger.addEventListener("click", (event) => {
      // Without this the click would reach the outside-click listener the very
      // open it just registered, and close the picker again.
      event.stopPropagation();
      this.isOpen ? this.close() : this.open();
    });

    const panel = el("div", "cp-panel");

    this.filter = el("input", "cp-filter");
    this.filter.type = "text";
    this.filter.placeholder = placeholder ?? "Filter…";
    this.filter.setAttribute("aria-label", label);
    this.filter.setAttribute("role", "combobox");
    this.filter.setAttribute("aria-autocomplete", "list");
    this.filter.setAttribute("aria-expanded", "false");
    this.filter.setAttribute("aria-controls", `${id}-list`);
    this.filter.addEventListener("input", () => this.applyFilter());

    this.list = el("ul", "cp-list");
    this.list.id = `${id}-list`;
    this.list.setAttribute("role", "listbox");
    options.forEach((option, index) => {
      const li = el("li", "cp-option");
      li.id = `${id}-o${index}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = option.label;
      li.addEventListener("click", () => this.activate(index));
      // Hovering moves the highlight rather than adding a second one, so there
      // is only ever one row that Enter could mean.
      li.addEventListener("mouseenter", () => this.highlight(index));
      this.list.append(li);
      this.rows.push({ option, li });
    });

    this.empty = el("div", "cp-empty");
    this.empty.textContent = "No matches";
    this.empty.hidden = true;

    panel.append(this.filter, this.list, this.empty);
    this.element.append(this.trigger, panel);
    this.element.addEventListener("keydown", (event) => this.onKey(event));
  }

  private open(): void {
    this.isOpen = true;
    this.element.classList.add("open");
    this.filter.setAttribute("aria-expanded", "true");
    this.filter.value = "";
    this.applyFilter();
    this.detachOutside = closeOnOutsideClick(this.element, () => this.close());
    this.filter.focus();
  }

  close(): void {
    this.isOpen = false;
    this.element.classList.remove("open");
    this.filter.setAttribute("aria-expanded", "false");
    this.detachOutside?.();
    this.detachOutside = null;
    // The caret can't stay in a box that has just gone display:none. It also
    // mustn't: the panel skips its re-render while a filter box holds focus, so
    // a picked option would never make it onto the block.
    if (this.hasFocus()) this.trigger.focus();
  }

  /** Whether the caret is in our filter box — checked against the shadow root. */
  private hasFocus(): boolean {
    const root = this.filter.getRootNode() as unknown as DocumentOrShadowRoot;
    return root.activeElement === this.filter;
  }

  /** Detaches listeners; call before discarding the picker. */
  destroy(): void {
    this.close();
  }

  /**
   * Hides the options the filter text rules out. Order is never rearranged —
   * only visibility changes — so the list doesn't reshuffle under the cursor
   * between keystrokes.
   */
  private applyFilter(): void {
    const needle = this.filter.value.trim().toLowerCase();
    let first = -1;
    this.rows.forEach(({ option, li }, index) => {
      const match = !needle || option.label.toLowerCase().includes(needle);
      li.hidden = !match;
      if (match && first === -1) first = index;
    });
    this.empty.hidden = first !== -1;
    this.highlight(first);
  }

  private highlight(index: number): void {
    if (index !== -1 && this.rows[index]?.li.hidden) return;
    this.rows[this.active]?.li.classList.remove("is-active");
    this.rows[this.active]?.li.setAttribute("aria-selected", "false");
    this.active = index;
    const row = this.rows[index];
    if (!row) {
      this.filter.removeAttribute("aria-activedescendant");
      return;
    }
    row.li.classList.add("is-active");
    row.li.setAttribute("aria-selected", "true");
    this.filter.setAttribute("aria-activedescendant", row.li.id);
  }

  /** Moves the highlight `delta` visible options along, wrapping at both ends. */
  private step(delta: number): void {
    const visible = this.rows.flatMap((row, index) => (row.li.hidden ? [] : [index]));
    const first = visible[0];
    if (first === undefined) return;
    const at = visible.indexOf(this.active);
    this.highlight(visible[(at + delta + visible.length) % visible.length] ?? first);
    this.rows[this.active]?.li.scrollIntoView({ block: "nearest" });
  }

  private activate(index: number): void {
    const row = this.rows[index];
    if (!row) return;
    // Closed first, so the re-render the click sets off finds a settled picker
    // — the same order `ContextMenu` picks for the same reason.
    this.close();
    row.option.onClick();
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.step(-1);
        break;
      case "Enter":
        event.preventDefault();
        if (this.active !== -1) this.activate(this.active);
        break;
      case "Escape":
        event.preventDefault();
        this.close();
        break;
      case "Tab":
        this.close();
        break;
    }
  }
}
