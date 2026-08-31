/**
 * One value in a multi-value row: the token, whatever detail it carries, and
 * the ✕ that takes it off.
 *
 * The DOM matches `preview/tags.ts`, which still draws the chips for the rows
 * that haven't been converted yet — the two agree because the stylesheet is the
 * contract between them, and `tags.ts` goes when its last caller does.
 */
import type { ComponentChildren } from "preact";

export interface ChipProps {
  /** The token a remove commits — a skill's name, an option's value. */
  value: string;
  /**
   * Shown before the detail: the value's text, or the control that edits it in
   * place. Empty renders no label at all (a walk speed).
   */
  label?: ComponentChildren;
  /** Trailing detail: a skill's "+7", or the control that edits it. */
  detail?: ComponentChildren;
  /** Names the ✕ where the label is a node, empty, or too terse to name it. */
  removeLabel?: string;
  onRemove?: () => void;
  /**
   * Drops the ✕ entirely. For a value that has no way to be emptied — a meta
   * slot whose field D&D Beyond offers no "nothing chosen" option for, where a
   * ✕ could only ever write something invalid.
   */
  hideRemove?: boolean;
}

export function Chip({ value, label, detail, removeLabel, onRemove, hideRemove }: ChipProps) {
  const named = removeLabel ?? (typeof label === "string" ? label : "");
  return (
    <span class="sb-chip" data-value={value}>
      {label ? <span class="sb-chip-label">{label}</span> : null}
      {detail !== undefined ? (
        <>
          {/* Separator for copied text only — the flex `gap` is what spaces
              them visually — and pointless with no label to separate from. */}
          {label ? " " : null}
          <span class="sb-chip-detail">{detail}</span>
        </>
      ) : null}
      {hideRemove ? null : (
        <button
          type="button"
          class="sb-chip-remove"
          aria-label={`Remove ${named}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}
