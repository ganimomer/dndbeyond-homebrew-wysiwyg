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
 *
 * `open` is a prop rather than internal state, because the owner sometimes has
 * to open it: revealing a row from the "Add…" menu is always a prelude to
 * picking something, and a closed dropdown would just cost another click.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

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

export interface PickerBodyProps {
  options: PickerOption[];
  trigger: PickerTrigger;
  /** Filter placeholder; defaults to "Filter…". */
  filterPlaceholder?: string;
  /**
   * Names this picker as a field's next control, so the owner can open it on
   * the render that reveals the field.
   */
  focusKey?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ids only have to be unique within the document, and aria-activedescendant needs them. */
let nextId = 0;

/**
 * The trigger and the panel. Everything but the `.cp` element that wraps them,
 * which the owner supplies — see `OptionPicker` below and the imperative shell
 * in editor/option-picker.ts.
 */
export function PickerBody({
  options,
  trigger,
  filterPlaceholder,
  focusKey,
  open,
  onOpenChange,
}: PickerBodyProps) {
  const id = useMemo(() => `cp-${nextId++}`, []);
  const [filter, setFilter] = useState("");
  /**
   * The highlighted option, or null to mean "wherever the filter says". Kept
   * separate from the derived default so that arrowing somewhere sticks, while
   * typing puts the highlight back where the new matches want it.
   */
  const [picked, setPicked] = useState<number | null>(null);

  const triggerEl = useRef<HTMLButtonElement>(null);
  const filterEl = useRef<HTMLInputElement>(null);
  const rows = useRef<Array<HTMLLIElement | null>>([]);

  const needle = filter.trim().toLowerCase();
  /** Indices of the options the filter admits, in source order. */
  const matches = useMemo(
    () =>
      options.flatMap((option, index) =>
        !needle || option.label.toLowerCase().includes(needle) ? [index] : [],
      ),
    [options, needle],
  );

  // With the filter empty the highlight starts on the value the field already
  // holds, the way a native select opens on its current option; once the user
  // has typed, the first match is the only sensible place for it.
  const fallback = needle
    ? matches[0]
    : (matches.find((index) => options[index]?.selected) ?? matches[0]);
  // Nothing is highlighted while it's shut: there is no row Enter could mean,
  // and a stray `is-active` would show through the closed trigger's styling.
  const active = !open
    ? -1
    : picked !== null && matches.includes(picked)
      ? picked
      : (fallback ?? -1);

  // Opening starts from a clean filter, with the caret in it.
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    if (open) {
      setFilter("");
      setPicked(null);
      filterEl.current?.focus();
      return;
    }
    // The caret can't stay in a box that has just gone display:none — and it
    // mustn't: a field's re-render is skipped while a filter box holds focus,
    // so a picked option would never make it onto the block.
    const root = filterEl.current?.getRootNode() as DocumentOrShadowRoot | undefined;
    if (root?.activeElement === filterEl.current) triggerEl.current?.focus();
  }, [open]);

  // Keeps the highlight on screen wherever it came from — the arrows walking
  // past the fold, or an open landing on a value far down the list.
  useLayoutEffect(() => {
    if (open && active !== -1) rows.current[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Abandons the picker when the click lands anywhere but inside it. Read with
  // `composedPath()` because this lives in a shadow root, where a listener out
  // on `window` would otherwise only ever see the host; in the capture phase,
  // so a click on D&D Beyond's page underneath the overlay counts as outside
  // too; and on `click` rather than `pointerdown`, so the click still reaches
  // whatever it landed on — which is what lets one click close this and open
  // the next chip's.
  useLayoutEffect(() => {
    if (!open) return;
    const onClick = (event: Event) => {
      const inside = event.composedPath().some((node) => node === triggerEl.current?.parentElement);
      if (!inside) onOpenChange(false);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [open, onOpenChange]);

  const take = (index: number) => {
    const option = options[index];
    if (!option) return;
    // Closed first, so the re-render the click sets off finds a settled picker
    // — the same order `ContextMenu` picks for the same reason.
    onOpenChange(false);
    option.onClick();
  };

  /** Moves the highlight `delta` visible options along, wrapping at both ends. */
  const step = (delta: number) => {
    const first = matches[0];
    if (first === undefined) return;
    const at = matches.indexOf(active);
    setPicked(matches[(at + delta + matches.length) % matches.length] ?? first);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Enter":
        event.preventDefault();
        if (active !== -1) take(active);
        break;
      case "Escape":
        event.preventDefault();
        onOpenChange(false);
        break;
      case "Tab":
        onOpenChange(false);
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerEl}
        type="button"
        class={`cp-trigger ${trigger.variant}${trigger.isPlaceholder ? " is-placeholder" : ""}`}
        aria-label={trigger.ariaLabel}
        data-focus-key={focusKey}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // Without this the click would reach the outside-click listener the
          // very open it just registered, and close the picker again.
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        {trigger.text}
      </button>
      <div class="cp-panel" onKeyDown={onKeyDown}>
        <input
          ref={filterEl}
          class="cp-filter"
          type="text"
          placeholder={filterPlaceholder ?? "Filter…"}
          aria-label={trigger.ariaLabel}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open ? "true" : "false"}
          aria-controls={`${id}-list`}
          aria-activedescendant={active === -1 ? undefined : `${id}-o${active}`}
          value={filter}
          onInput={(event) => {
            setFilter((event.target as HTMLInputElement).value);
            setPicked(null);
          }}
        />
        <ul class="cp-list" id={`${id}-list`} role="listbox">
          {options.map((option, index) => (
            <li
              key={option.label}
              ref={(node) => {
                rows.current[index] = node;
              }}
              id={`${id}-o${index}`}
              class={`cp-option${option.selected ? " is-selected" : ""}${
                index === active ? " is-active" : ""
              }`}
              role="option"
              // `aria-selected` is the value the field holds; the highlight the
              // arrows move is `aria-activedescendant`, and the two are not the
              // same thing.
              aria-selected={option.selected ? "true" : "false"}
              // Hidden rather than dropped, so the list never reshuffles under
              // the cursor between keystrokes.
              hidden={!matches.includes(index)}
              onClick={() => take(index)}
              // Hovering moves the highlight rather than adding a second one, so
              // there is only ever one row that Enter could mean.
              onMouseEnter={() => setPicked(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
        <div class="cp-empty" hidden={matches.length > 0}>
          No matches
        </div>
      </div>
    </>
  );
}

/** The picker as a self-contained element, for use inside a component tree. */
export function OptionPicker(props: PickerBodyProps) {
  return (
    <div class={props.open ? "cp open" : "cp"}>
      <PickerBody {...props} />
    </div>
  );
}
