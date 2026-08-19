/**
 * Makes the rows backed by a single free-text D&D Beyond input — Gear and the
 * Languages note — editable in place. Both are ordinary form fields, so they
 * commit on `change` (blur or Enter, never per keystroke) and ride autosave.
 *
 * The ✕ clears the value, which is also how the row leaves the stat block:
 * with nothing in it there's nothing to print, so `onClear` un-reveals it too.
 */
import type { Monster } from "../statblock/model.js";
import type { TextField } from "../preview/text-line.js";
import { commitOnEnter } from "./inline-input.js";

export interface TextFieldHandlers {
  /** The field's new value, once the user has finished typing it. */
  onCommit: (field: TextField, value: string) => void;
  /** The ✕: drop the value *and* the row. */
  onClear: (field: TextField) => void;
}

const FIELDS: TextField[] = ["gear", "languages"];

export function wireTextFields(
  scope: ParentNode,
  monster: Monster,
  { onCommit, onClear }: TextFieldHandlers,
): void {
  for (const field of FIELDS) {
    const wrap = scope.querySelector<HTMLElement>(`.sb-text[data-field="${field}"]`);
    if (!wrap) continue;

    const input = wrap.querySelector<HTMLInputElement>(".sb-text-input");
    if (input) {
      commitOnEnter(input);
      input.addEventListener("change", () => {
        const value = input.value.trim();
        if (value === monster[field]) return;
        onCommit(field, value);
      });
    }

    wrap.querySelector<HTMLButtonElement>(".sb-text-clear")?.addEventListener("click", () => {
      onClear(field);
    });
  }
}
