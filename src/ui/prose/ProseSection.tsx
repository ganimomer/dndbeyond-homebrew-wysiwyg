/**
 * A description section's body, editable in place.
 *
 * The editor is created once and lives in a ref, so it survives every
 * re-render: Preact keeps the host node, and Lexical keeps its selection,
 * undo history and in-flight composition with it. That is the whole reason the
 * conversion was worth doing — the old loop rebuilt the block on every form
 * mutation and had to skip renders outright while this field held focus.
 *
 * Content flows in only when the user is elsewhere. An edit made in D&D
 * Beyond's own textarea should show up here; the same edit echoing back from
 * our own debounced write-back must not reach in and disturb the caret.
 *
 * Sections a creature has no HTML for — the structured samples — stay
 * read-only; there is no D&D Beyond field behind them to write to.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import type { SectionKey } from "../../statblock/model.js";
import { ProseEditor } from "../../editor/prose-editor.js";
import { useEditing } from "../store-context.js";

export interface ProseSectionProps {
  section: SectionKey;
  html: string;
  /**
   * Put the caret here as soon as it mounts. Set by the "Add section" menu:
   * adding a section is always a prelude to writing in it.
   */
  autoFocus?: boolean;
  /** Shown while the section is empty, e.g. "Write the creature's traits…". */
  placeholder?: string;
}

export function ProseSection({ section, html, autoFocus, placeholder }: ProseSectionProps) {
  const editing = useEditing();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<ProseEditor | null>(null);
  /** Held in a ref so the editor's one commit callback never goes stale. */
  const commit = useRef(editing);
  commit.current = editing;

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const created = new ProseEditor({
      section,
      initialHtml: html,
      onCommit: (key, edited) => commit.current.setDescription(key, edited),
    });
    created.mount(node);
    editor.current = created;
    // Read once, on mount: it says how this section came to be on the block, and
    // a later re-render must never steal the caret back.
    if (autoFocus) created.focus();
    return () => {
      created.destroy();
      editor.current = null;
    };
    // Created once per section. `html` seeds it; the effect below keeps up.
  }, [section]);

  useLayoutEffect(() => {
    const live = editor.current;
    // Never while they're typing — that is what the old render guard was for.
    if (live && !live.hasFocus()) live.setContent(html);
  }, [html]);

  return (
    <div class="content sb-prose" data-section={section} data-placeholder={placeholder} ref={host} />
  );
}
