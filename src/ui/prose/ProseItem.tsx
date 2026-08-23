/**
 * One editable box: a Lexical editor, the floating format toolbar over it, and
 * whatever control the owner wants in its corner.
 *
 * This is the seam that used to be `ProseSection` — the editor is created once
 * and lives in a ref, so it survives every re-render: Preact keeps the host
 * node, and Lexical keeps its selection, undo history and in-flight composition
 * with it. Content flows in only when the user is elsewhere, so an edit made in
 * D&D Beyond's own textarea shows up here while our own debounced write-back
 * echoing back never disturbs the caret.
 *
 * It has no idea whether it holds a whole section or one trait out of six. The
 * list sections mount several; the Description mounts one.
 */
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import {
  NO_FORMAT,
  ProseEditor,
  type FormatState,
  type TextFormat,
} from "../../editor/prose-editor.js";
import { FormatToolbar } from "./FormatToolbar.js";
import { useReferenceMenu } from "./use-reference-menu.js";

export interface ProseItemProps {
  /** Distinguishes the editor in Lexical's namespace and in error logs. */
  name: string;
  html: string;
  /** Shown while the box is empty, e.g. "A feature the creature always has…". */
  placeholder?: string;
  /** Put the caret here as soon as it mounts, and scroll it into view. */
  autoFocus?: boolean;
  /** Formats to switch on when autofocusing — a new entry opens bold italic. */
  focusFormats?: readonly TextFormat[];
  /** Which end of the box the caret lands on when autofocusing. */
  focusCaret?: "start" | "end";
  /** Draw the eye to this entry: a wash that plays once and fades. */
  spotlight?: boolean;
  onCommit: (html: string) => void;
  /**
   * The author ended this box with a blank line: what is left of it, and what
   * should open in a new box below. Left off, Enter is just Enter.
   */
  onSplit?: (remainingHtml: string, movedHtml: string) => void;
  /** Called when focus leaves the box entirely and there's nothing in it. */
  onEmptyBlur?: () => void;
  /** Anything the owner hangs in the corner — the entry's trash, in practice. */
  children?: ComponentChildren;
}

export function ProseItem({
  name,
  html,
  placeholder,
  autoFocus,
  spotlight,
  focusFormats,
  focusCaret,
  onCommit,
  onSplit,
  onEmptyBlur,
  children,
}: ProseItemProps) {
  const host = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const editor = useRef<ProseEditor | null>(null);
  const [format, setFormat] = useState<FormatState>(NO_FORMAT);
  const references = useReferenceMenu(editor);
  /** Held in refs so the editor's one set of callbacks never goes stale. */
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const emptyBlur = useRef(onEmptyBlur);
  emptyBlur.current = onEmptyBlur;
  const split = useRef(onSplit);
  split.current = onSplit;

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const created = new ProseEditor({
      name,
      initialHtml: html,
      onCommit: (edited) => commit.current(edited),
      onFormat: setFormat,
      onTrigger: references.onTrigger,
      onMenuKey: references.onMenuKey,
      // Only where the owner wants one: a list section ends an entry on a blank
      // line, the Description is prose and keeps its blank lines.
      onSplit: onSplit && ((remaining, moved) => split.current?.(remaining, moved)),
    });
    created.mount(node);
    editor.current = created;
    // Read once, on mount: it says how this box came to be on the block, and a
    // later re-render must never steal the caret back.
    if (autoFocus) {
      created.focus(focusFormats, focusCaret);
      // A new entry is appended at the foot of a section that may well be off
      // the bottom of the overlay's scroller by now.
      wrapper.current?.scrollIntoView({ block: "nearest" });
    }
    return () => {
      created.destroy();
      editor.current = null;
    };
    // Created once. `html` seeds it; the effect below keeps up.
  }, [name]);

  // Only the kind stage takes keys off the editor. The entity stage has the
  // caret in its own filter box and handles its own.
  useLayoutEffect(() => {
    editor.current?.setMenuOpen(references.stage === "kinds");
  }, [references.stage]);

  useLayoutEffect(() => {
    const current = editor.current;
    if (!current) return;
    // Never while they're typing — that is what the old render guard was for.
    // And never while the reference menu is up, or while a lookup is out: see
    // `ReferenceMenuControl.isAway`.
    if (current.hasFocus() || references.isAway()) return;
    current.setContent(html);
  }, [html, references.stage]);

  return (
    <div
      class={spotlight ? "sb-item is-spotlit" : "sb-item"}
      ref={wrapper}
      onFocusOut={(event) => {
        // Only when focus has actually left the entry. Clicking this entry's own
        // trash or a toolbar button is still being *in* it, and reaping the row
        // out from under either would be baffling.
        const next = event.relatedTarget as Node | null;
        if (next && wrapper.current?.contains(next)) return;
        if (editor.current?.isEmpty()) emptyBlur.current?.();
      }}
    >
      <div class="content sb-prose" data-placeholder={placeholder} ref={host} />
      {/* After the editor, not before it: the bar reports on the caret, so what
          reveals it is the *editor* having focus — and an adjacent-sibling rule
          is the only way to say that without `:has()`, which the Firefox this
          builds for hasn't got. Since the drag handle became a focusable thing
          inside the entry, `:focus-within` means something else now. */}
      <FormatToolbar
        format={format}
        onToggle={(f) => editor.current?.toggleFormat(f)}
        onAdd={references.openAt}
      />
      {references.node}
      {children}
    </div>
  );
}
