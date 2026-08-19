/**
 * Turns the name row (emitted by `nameRow`) into a live editor.
 *
 * The name is a `contenteditable`, so unlike the inline `<input>`s it needs the
 * text-field behaviors spelled out: Enter commits instead of inserting a line
 * break, Escape abandons the edit, and a paste is forced to plain text. What
 * lands in the form is always a single trimmed line — the node itself can hold
 * newlines while the user is mid-edit (a multi-line paste on the fallback path),
 * so the sanitizer, not the markup, is what guarantees it.
 *
 * Nothing is written until the user is done: the panel's re-render is suppressed
 * while this field has focus, so typing can't be interrupted by our own
 * write-back echoing through `observe()`.
 */
import type { Monster } from "../statblock/model.js";
import { commitOnEnter } from "./inline-input.js";

export interface NameHandlers {
  /** Called with the new name once the user is done editing it. */
  onCommit(name: string): void;
}

/** The single line that goes into the form: no runs of whitespace, no newlines. */
function sanitize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function wireName(scope: ParentNode, monster: Monster, handlers: NameHandlers): void {
  const field = scope.querySelector<HTMLElement>(".name-row .name");
  if (!field) return;

  // What the form holds, as far as we know. Tracked here rather than re-read from
  // `monster` so a second blur is a no-op even before the commit has re-rendered
  // us with a fresh monster.
  let committed = monster.name;

  const showPrompt = () => field.classList.toggle("is-empty", !field.textContent?.trim());

  field.addEventListener("input", showPrompt);

  // Enter means "done" here, not "new paragraph"; commitOnEnter blurs, and the
  // blur handler below is what actually commits.
  commitOnEnter(field);

  field.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    field.textContent = committed; // back to what the form still holds
    showPrompt();
    field.blur();
  });

  // Paste plain text only, so no markup lands in the node on browsers without
  // contenteditable="plaintext-only".
  field.addEventListener("paste", (event) => {
    const clipboard = (event as ClipboardEvent).clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    const text = sanitize(clipboard.getData("text/plain"));
    if (!text) return;
    document.execCommand?.("insertText", false, text);
    showPrompt();
  });

  field.addEventListener("blur", () => {
    const name = sanitize(field.textContent ?? "");
    // Show what we're about to store, so a stray space doesn't leave the preview
    // disagreeing with the form — and so a second blur is a genuine no-op.
    if (field.textContent !== name) field.textContent = name;
    showPrompt();
    // A bare focus-and-tab-away must not spin autosave.
    if (name === committed) return;
    committed = name;
    handlers.onCommit(name);
  });
}
