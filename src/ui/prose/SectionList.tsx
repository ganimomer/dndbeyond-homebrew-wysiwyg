/**
 * A description section edited as the list it is: one editor per entry, and a
 * button at the foot to add another.
 *
 * D&D Beyond stores the whole section as a single HTML string, and that doesn't
 * change — the entries are cut out of it on the way in (`splitItems`) and
 * concatenated back on the way out (`joinItems`), so the adapter, the codec, the
 * autosave debounce and the section's save slot all carry on seeing exactly what
 * they saw before. What changes is what the author gets hold of: a trait rather
 * than a wall of text.
 *
 * Rows are held here rather than derived on every render, because a row is a
 * mounted Lexical editor with a caret and an undo stack in it. Re-deriving would
 * throw those away on every keystroke the debounce commits.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SectionKey } from "../../statblock/model.js";
import { useEditing } from "../store-context.js";
import { Icon } from "../shared/Icon.js";
import { ProseItem } from "./ProseItem.js";
import { RemoveItem } from "./RemoveItem.js";
import { joinItems, splitItems } from "./section-items.js";
import { SECTION_ITEM_LABEL } from "./section-registry.js";
import { htmlHasContent } from "./sections.js";

/** Every entry a new one opens with — how a trait's name is printed. */
const NEW_ENTRY_FORMATS = ["bold", "italic"] as const;

interface Row {
  /** Stable for as long as this entry's editor is mounted. */
  readonly id: number;
  readonly html: string;
}

/**
 * The rows a section's HTML makes, reusing the ids already in place.
 *
 * Positional reuse is what lets an entry survive an external change to the
 * section: the editor at index 2 stays mounted, keeps its undo history, and is
 * merely handed new content (which `setContent` skips when it matches). Minting
 * fresh ids each time would remount every editor on the block instead.
 */
function reconcile(previous: readonly Row[], htmls: readonly string[], nextId: () => number): Row[] {
  return htmls.map((html, index) => ({ id: previous[index]?.id ?? nextId(), html }));
}

export function SectionList({
  section,
  html,
  placeholder,
  autoFocus,
}: {
  section: SectionKey;
  html: string;
  placeholder?: string;
  /** The section was just added — open it with one entry and the caret in it. */
  autoFocus?: boolean;
}) {
  const editing = useEditing();
  const listRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const nextId = () => (counter.current += 1);
  const focusables = useRef(new Set<number>());

  const [rows, setRows] = useState<Row[]>(() => {
    const initial = splitItems(html);
    // A section with nothing in it still needs somewhere to put the caret — and
    // a section that was just added is about to get one.
    if (initial.length === 0) {
      const row = { id: nextId(), html: "" };
      if (autoFocus) focusables.current.add(row.id);
      return [row];
    }
    return reconcile([], initial, nextId);
  });
  /** The rows as of *now*, for callbacks that fire between renders. */
  const live = useRef(rows);
  live.current = rows;

  const write = (next: Row[]) => {
    live.current = next;
    setRows(next);
    editing.setDescription(section, joinItems(next.map((row) => row.html)));
  };

  // Content arriving from elsewhere — D&D Beyond's own textarea, an undo. Never
  // while the author is in one of these editors, and never when it's only our
  // own write-back coming back around.
  useLayoutEffect(() => {
    if (joinItems(live.current.map((row) => row.html)) === html) return;
    // Inside a shadow root `document.activeElement` is the host, so resolve the
    // active element against the list's own root node (the same dance
    // `ProseEditor.hasFocus` does).
    const list = listRef.current;
    const scope = list?.getRootNode() as Document | ShadowRoot | undefined;
    const focused = scope?.activeElement;
    if (focused && list?.contains(focused)) return;
    const next = reconcile(live.current, splitItems(html), nextId);
    live.current = next;
    setRows(next.length ? next : [{ id: nextId(), html: "" }]);
  }, [html]);

  const itemLabel = SECTION_ITEM_LABEL[section];

  const addRow = () => {
    const row = { id: nextId(), html: "" };
    focusables.current.add(row.id);
    // Not `write`: an empty entry contributes nothing to the section, so there
    // is nothing to tell D&D Beyond until something is typed in it.
    const next = [...live.current, row];
    live.current = next;
    setRows(next);
  };

  /**
   * The author ended an entry with a blank line: it keeps `remaining`, and what
   * was under the cut opens as the entry below it, with the caret in it.
   */
  const splitRow = (id: number, remaining: string, moved: string) => {
    // An entry with nothing left in it contributes nothing to the section, and
    // Lexical's empty paragraph is not nothing — it is the very placeholder
    // markup D&D Beyond leaves in an unused field. Held as "" so the joined
    // section is what it would be if the entry weren't there at all.
    const content = (html: string) => (htmlHasContent(html) ? html : "");
    const row = { id: nextId(), html: content(moved) };
    focusables.current.add(row.id);
    write(
      live.current.flatMap((r) => (r.id === id ? [{ ...r, html: content(remaining) }, row] : [r])),
    );
  };

  const removeRow = (id: number) => {
    // The last entry stays. An author who clears a section's only trait is
    // usually about to retype it, and pulling the editor out from under them
    // would be the same mistake the section-level reveal exists to avoid.
    if (live.current.length <= 1) return;
    write(live.current.filter((row) => row.id !== id));
  };

  return (
    <div class="sb-section-list" data-section={section} ref={listRef}>
      {rows.map((row, index) => {
        // Read once per row, the way `autoFocus` has always been read: a later
        // re-render must never steal the caret back.
        const claimFocus = focusables.current.delete(row.id);
        return (
          <ProseItem
            key={row.id}
            name={`${section}-${row.id}`}
            html={row.html}
            // Only the first entry says what belongs in the section; on the rest
            // it would be six identical lines of grey italic.
            placeholder={index === 0 ? placeholder : undefined}
            autoFocus={claimFocus}
            // An entry opens bold italic because that is how a trait's *name*
            // is typed — but half an entry cut loose by a blank line arrives
            // with its own formatting, and the caret belongs at its head.
            focusFormats={row.html ? undefined : NEW_ENTRY_FORMATS}
            focusCaret={row.html ? "start" : "end"}
            onCommit={(edited) =>
              write(live.current.map((r) => (r.id === row.id ? { ...r, html: edited } : r)))
            }
            onSplit={(remaining, moved) => splitRow(row.id, remaining, moved)}
            onEmptyBlur={() => removeRow(row.id)}
          >
            {rows.length > 1 ? (
              <RemoveItem
                label={itemLabel}
                hasContent={htmlHasContent(row.html)}
                onRemove={() => removeRow(row.id)}
              />
            ) : null}
          </ProseItem>
        );
      })}
      <button type="button" class="sb-add sb-add-item" onClick={addRow}>
        <Icon name="add" size={16} />
        {`Add ${itemLabel}`}
      </button>
    </div>
  );
}
