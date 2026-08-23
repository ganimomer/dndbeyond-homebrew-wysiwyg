/**
 * The rows backed by a single free-text D&D Beyond input — Gear and the
 * Languages note.
 *
 * A one-line box, but not a one-line `<input>`, because the text in it is not
 * only text. D&D Beyond stores Gear as macros —
 * `[items]Greatsword[/items], [items]splint;Splint Armor[/items]` — and renders
 * each one as a link on the creature's page. An `<input>` can hold that string
 * but can only ever show it, so the preview was showing the author their own
 * markup where the block should have shown three items.
 *
 * So it is the same Lexical editor the description entries use, in single-line
 * mode: the references render as references, hover for their D&D Beyond
 * definition like every other reference on the block, and a slash opens the
 * same "what kind of thing? which one?" menu. What it does *not* have is the
 * format bar — bold and italic have nowhere to live in a plain form field, and
 * offering them would be promising something the round trip can't keep.
 *
 * Committing is `ProseEditor`'s own debounce, plus Enter, which commits and
 * lets go the way the plain input always did.
 *
 * The ✕ clears the value, which is also how the row leaves the stat block:
 * with nothing in it there is nothing to print.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import { ProseEditor } from "../../editor/prose-editor.js";
import { ddbTextToEditorHtml, editorHtmlToDdbText } from "../../adapter/ddb-text.js";
import { useReferenceMenu } from "../prose/use-reference-menu.js";

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
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ProseEditor | null>(null);
  const references = useReferenceMenu(editor);
  const html = ddbTextToEditorHtml(value);
  /** Held in refs so the editor's one set of callbacks never goes stale. */
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const current = useRef(value);
  current.current = value;

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const created = new ProseEditor({
      name: field,
      initialHtml: html,
      singleLine: true,
      onCommit: (edited) => {
        const next = editorHtmlToDdbText(edited);
        // The codec round-trips byte-for-byte, so an edit that changed nothing
        // — a caret move, a paste of what was already there — says nothing.
        if (next === current.current) return;
        commit.current(field, next);
      },
      onTrigger: references.onTrigger,
      onMenuKey: references.onMenuKey,
    });
    created.mount(node);
    editor.current = created;
    return () => {
      created.destroy();
      editor.current = null;
    };
    // Created once. `html` seeds it; the effect below keeps up.
  }, [field]);

  // Only the kind stage takes keys off the editor. The entity stage has the
  // caret in its own filter box and handles its own.
  useLayoutEffect(() => {
    editor.current?.setMenuOpen(references.stage === "kinds");
  }, [references.stage]);

  useLayoutEffect(() => {
    const box = editor.current;
    if (!box) return;
    // Never while they're typing, and never while a menu or a lookup holds the
    // caret — the same guard, for the same reasons, as a prose entry's.
    if (box.hasFocus() || references.isAway()) return;
    box.setContent(html);
  }, [html, references.stage]);

  return (
    <span class="sb-text" data-field={field}>
      <div
        class="sb-prose sb-text-prose"
        data-placeholder={placeholder}
        data-focus-key={`text:${field}`}
        aria-label={label}
        ref={host}
      />
      {references.node}
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
