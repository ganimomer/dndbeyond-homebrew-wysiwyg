/**
 * The rows backed by a single free-text D&D Beyond input — Gear and the
 * Languages note.
 *
 * The value is edited in place and commits on blur or Enter, never per
 * keystroke — see `shared/inline-input.ts` for why every inline field does.
 *
 * The ✕ clears the value, which is also how the row leaves the stat block:
 * with nothing in it there is nothing to print.
 */
import { useRef } from "preact/hooks";
import { blurOnEnter, useSyncedValue } from "../shared/inline-input.js";

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
  useSyncedValue(input, value);

  return (
    <span class="sb-text" data-field={field}>
      <input
        ref={input}
        class="sb-text-input"
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        data-focus-key={`text:${field}`}
        aria-label={label}
        onKeyDown={blurOnEnter}
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
