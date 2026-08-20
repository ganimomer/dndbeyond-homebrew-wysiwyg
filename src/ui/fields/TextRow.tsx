/**
 * The rows backed by a single free-text D&D Beyond input — Gear and the
 * Languages note.
 *
 * The value is edited in place and commits on `change`, which is to say on blur
 * or Enter and never per keystroke: the write-back re-renders the block, and a
 * creature whose name changed on every letter would be unusable. The input is
 * therefore uncontrolled — `value` seeds it, the user owns it from then on.
 *
 * The ✕ clears the value, which is also how the row leaves the stat block:
 * with nothing in it there is nothing to print.
 */
import { useLayoutEffect, useRef } from "preact/hooks";

/** The fields this renders, named for the model field they show. */
export type TextField = "gear" | "languages";

export interface TextRowProps {
  field: TextField;
  value: string;
  label: string;
  placeholder: string;
  /** The new value, once the user has finished typing it. */
  onCommit: (field: TextField, value: string) => void;
  /** The ✕: drop the value *and* the row. */
  onClear: (field: TextField) => void;
}

export function TextRow({ field, value, label, placeholder, onCommit, onClear }: TextRowProps) {
  const input = useRef<HTMLInputElement>(null);

  // Uncontrolled, so the input keeps whatever the user has typed — but when the
  // value changes underneath us (an undo, or an edit made in DDB's own field)
  // the box has to follow. Never while they are in it.
  //
  // A layout effect, so the box is right before anything can look at it: the
  // render loop reads the block it has just drawn.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const root = el.getRootNode() as unknown as DocumentOrShadowRoot;
    if (root.activeElement === el) return;
    el.value = value;
  }, [value]);

  return (
    <span class="sb-text" data-field={field}>
      <input
        ref={input}
        class="sb-text-input"
        type="text"
        // The attribute, not the property: this seeds the box and then leaves
        // it alone. Re-rendering must not reach in and retype it.
        defaultValue={value}
        placeholder={placeholder}
        data-focus-key={`text:${field}`}
        aria-label={label}
        onKeyDown={(event) => {
          // Enter means "I'm done", the way blurring does. Without this the
          // form would take it as a submit.
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        onChange={(event) => {
          const next = (event.currentTarget as HTMLInputElement).value.trim();
          if (next === value) return;
          onCommit(field, next);
        }}
      />
      <button
        type="button"
        class="sb-text-clear"
        aria-label={`Clear ${label}`}
        onClick={() => onClear(field)}
      >
        ×
      </button>
    </span>
  );
}
