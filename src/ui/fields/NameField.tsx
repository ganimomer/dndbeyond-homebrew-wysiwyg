/**
 * The creature's name.
 *
 * A `contenteditable` rather than an `<input>`: it is large display type that
 * has to wrap to a second line on a long name, which an input can't do — it
 * would scroll horizontally instead. That costs the text-field behaviours an
 * input gives away, so they are spelled out here: Enter commits instead of
 * inserting a line break, Escape abandons the edit, and a paste is forced to
 * plain text.
 *
 * The content is set imperatively rather than rendered as children. Preact
 * would otherwise rewrite the node's text on every re-render, which is the one
 * thing a field being typed into cannot survive. So the value seeds it, and
 * afterwards it is only ever written back when the user is somewhere else.
 *
 * The "Unnamed Creature" prompt is CSS on `.is-empty`, not text content, so an
 * unnamed creature isn't handed a placeholder it has to delete before typing.
 */
import { useLayoutEffect, useRef } from "preact/hooks";

/** The focus key the panel restores the caret to. */
export const NAME_FOCUS_KEY = "name";

/**
 * True where `contenteditable="plaintext-only"` is honoured. It keeps the node
 * a single run of text — no pasted markup, no rich-text keyboard shortcuts.
 * Where it isn't (older Firefox), plain `contenteditable` plus the paste
 * handler and the commit-time sanitizer get to the same place.
 */
const SUPPORTS_PLAINTEXT_ONLY = (() => {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("div");
  // Guard the probe itself: where contentEditable isn't implemented at all
  // (jsdom), assigning it just creates an expando that reads back as supported.
  if (!("contentEditable" in probe)) return false;
  try {
    probe.contentEditable = "plaintext-only";
  } catch {
    return false; // some engines throw on the unsupported value rather than ignoring
  }
  return probe.contentEditable === "plaintext-only";
})();

/** The single line that goes into the form: no runs of whitespace, no newlines. */
function sanitize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface NameFieldProps {
  name: string;
  /** Called with the new name once the user is done editing it. */
  onCommit: (name: string) => void;
}

export function NameField({ name, onCommit }: NameFieldProps) {
  const field = useRef<HTMLDivElement>(null);
  /**
   * What the form holds, as far as we know. Tracked here rather than read from
   * the prop so a second blur is a no-op even before the commit has re-rendered
   * us with a fresh creature.
   */
  const committed = useRef(name);

  const showPrompt = () => {
    const node = field.current;
    if (node) node.classList.toggle("is-empty", !node.textContent?.trim());
  };

  // Seed the node, and follow the name when it changes underneath — an edit
  // made in D&D Beyond's own field — but never while the user is in it.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    const root = node.getRootNode() as unknown as DocumentOrShadowRoot;
    if (root.activeElement === node) return;
    if (node.textContent !== name) node.textContent = name;
    committed.current = name;
    showPrompt();
  }, [name]);

  return (
    <div
      ref={field}
      class={name ? "name" : "name is-empty"}
      // The attribute, not the property: it is the form that survives
      // environments where contentEditable isn't implemented, and what the CSS
      // selector matches.
      contenteditable={SUPPORTS_PLAINTEXT_ONLY ? "plaintext-only" : "true"}
      data-focus-key={NAME_FOCUS_KEY}
      role="textbox"
      aria-label="Creature name"
      onInput={showPrompt}
      onKeyDown={(event) => {
        const node = field.current;
        if (!node) return;
        if (event.key === "Enter") {
          // Enter means "done" here, not "new paragraph". Blurring is what
          // commits, below.
          event.preventDefault();
          node.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          node.textContent = committed.current; // back to what the form still holds
          showPrompt();
          node.blur();
        }
      }}
      onPaste={(event) => {
        // Plain text only, so no markup lands in the node on browsers without
        // contenteditable="plaintext-only".
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        event.preventDefault();
        const text = sanitize(clipboard.getData("text/plain"));
        if (!text) return;
        document.execCommand?.("insertText", false, text);
        showPrompt();
      }}
      onBlur={() => {
        const node = field.current;
        if (!node) return;
        const next = sanitize(node.textContent ?? "");
        // Show what we're about to store, so a stray space doesn't leave the
        // preview disagreeing with the form — and so a second blur is a no-op.
        if (node.textContent !== next) node.textContent = next;
        showPrompt();
        // A bare focus-and-tab-away must not spin autosave.
        if (next === committed.current) return;
        committed.current = next;
        onCommit(next);
      }}
    />
  );
}
