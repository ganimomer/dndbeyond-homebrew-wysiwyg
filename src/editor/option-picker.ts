/**
 * A popover whose first control is a filter box, so picking one of forty-five
 * damage types is three keystrokes rather than a scan down a scrolling list.
 * Two faces, one behaviour: a chip row's "＋", and a meta-line slot whose
 * trigger reads as the value it currently holds.
 *
 * Deliberately not a `ContextMenu`. That one is D&D Beyond's kebab "actions"
 * menu — a handful of icon-labelled commands, mouse-driven, Escape its whole
 * keyboard model. This is a pick from a long list of like-shaped options, so it
 * gets the combobox treatment instead: autofocused filter, ↑/↓ over a highlight,
 * Enter to take it. The host injects option-picker.css into the same shadow root.
 */
import { el } from "../preview/dom.js";
import { closeOnOutsideClick } from "./mini-form.js";

export interface PickerOption {
  label: string;
  /** The current value, in a single-select. A chip row never sets it. */
  selected?: boolean;
  onClick: () => void;
}

export interface PickerTrigger {
  /** "＋" on a chip row; the chosen value on a meta slot. */
  text: string;
  ariaLabel: string;
  variant: "add" | "value";
  /** Dims the text — a meta slot still showing "Alignment…". */
  isPlaceholder?: boolean;
}

export interface OptionPickerOptions {
  trigger: PickerTrigger;
  /** Filter placeholder; defaults to "Filter…". */
  filterPlaceholder?: string;
  /**
   * Names this picker as a field's next control, so the panel can open it on
   * the render that reveals the field (see `EditorPanel.render`).
   */
  focusKey?: string;
}

/** Ids only have to be unique within the document, and aria-activedescendant needs them. */
let nextId = 0;

export class OptionPicker {
  readonly element: HTMLElement;
  readonly focusKey: string | null;

  private readonly trigger: HTMLButtonElement;
  private readonly filter: HTMLInputElement;
  private readonly empty: HTMLElement;
  /** The options in source order, each with the `li` painting it. */
  private readonly rows: { option: PickerOption; li: HTMLElement }[] = [];

  private isOpen = false;
  /** Index into `rows` of the highlighted option, or -1 when nothing matches. */
  private active = -1;
  private detachOutside: (() => void) | null = null;

  constructor(options: PickerOption[], config: OptionPickerOptions) {
    const { trigger, filterPlaceholder, focusKey } = config;
    const id = `cp-${nextId++}`;
    this.focusKey = focusKey ?? null;
    this.element = el("div", "cp");

    this.trigger = el("button", `cp-trigger ${trigger.variant}`);
    this.trigger.type = "button";
    this.trigger.setAttribute("aria-label", trigger.ariaLabel);
    this.trigger.textContent = trigger.text;
    if (trigger.isPlaceholder) this.trigger.classList.add("is-placeholder");
    if (focusKey) this.trigger.dataset.focusKey = focusKey;
    this.trigger.addEventListener("click", (event) => {
      // Without this the click would reach the outside-click listener the very
      // open it just registered, and close the picker again.
      event.stopPropagation();
      this.isOpen ? this.close() : this.open();
    });

    const panel = el("div", "cp-panel");

    this.filter = el("input", "cp-filter");
    this.filter.type = "text";
    this.filter.placeholder = filterPlaceholder ?? "Filter…";
    this.filter.setAttribute("aria-label", trigger.ariaLabel);
    this.filter.setAttribute("role", "combobox");
    this.filter.setAttribute("aria-autocomplete", "list");
    this.filter.setAttribute("aria-expanded", "false");
    this.filter.setAttribute("aria-controls", `${id}-list`);
    this.filter.addEventListener("input", () => this.applyFilter());

    const list = el("ul", "cp-list");
    list.id = `${id}-list`;
    list.setAttribute("role", "listbox");
    options.forEach((option, index) => {
      const li = el("li", "cp-option");
      li.id = `${id}-o${index}`;
      li.setAttribute("role", "option");
      // `aria-selected` is the value the field holds; the highlight the arrows
      // move is `aria-activedescendant`, and the two are not the same thing.
      li.setAttribute("aria-selected", option.selected ? "true" : "false");
      if (option.selected) li.classList.add("is-selected");
      li.textContent = option.label;
      li.addEventListener("click", () => this.activate(index));
      // Hovering moves the highlight rather than adding a second one, so there
      // is only ever one row that Enter could mean.
      li.addEventListener("mouseenter", () => this.highlight(index));
      list.append(li);
      this.rows.push({ option, li });
    });

    this.empty = el("div", "cp-empty");
    this.empty.textContent = "No matches";
    this.empty.hidden = true;

    panel.append(this.filter, list, this.empty);
    this.element.append(this.trigger, panel);
    this.element.addEventListener("keydown", (event) => this.onKey(event));
  }

  open(): void {
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
   *
   * With the filter empty the highlight starts on the value the field already
   * holds, the way a native select opens on its current option; once the user
   * has typed, the first match is the only sensible place for it.
   */
  private applyFilter(): void {
    const needle = this.filter.value.trim().toLowerCase();
    let first = -1;
    let current = -1;
    this.rows.forEach(({ option, li }, index) => {
      const match = !needle || option.label.toLowerCase().includes(needle);
      li.hidden = !match;
      if (!match) return;
      if (first === -1) first = index;
      if (option.selected && current === -1) current = index;
    });
    this.empty.hidden = first !== -1;
    this.highlight(needle ? first : (current === -1 ? first : current));
  }

  private highlight(index: number): void {
    if (index !== -1 && this.rows[index]?.li.hidden) return;
    this.rows[this.active]?.li.classList.remove("is-active");
    this.active = index;
    const row = this.rows[index];
    if (!row) {
      this.filter.removeAttribute("aria-activedescendant");
      return;
    }
    row.li.classList.add("is-active");
    this.filter.setAttribute("aria-activedescendant", row.li.id);
    // Keeps the highlight on screen wherever it came from — the arrows walking
    // past the fold, or an open landing on a value far down the list.
    row.li.scrollIntoView({ block: "nearest" });
  }

  /** Moves the highlight `delta` visible options along, wrapping at both ends. */
  private step(delta: number): void {
    const visible = this.rows.flatMap((row, index) => (row.li.hidden ? [] : [index]));
    const first = visible[0];
    if (first === undefined) return;
    const at = visible.indexOf(this.active);
    this.highlight(visible[(at + delta + visible.length) % visible.length] ?? first);
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
