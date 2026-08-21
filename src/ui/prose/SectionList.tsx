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
import { revealSection } from "../../state/session.js";
import { useEditing, useStore } from "../store-context.js";
import { Icon } from "../shared/Icon.js";
import { DragHandle } from "./DragHandle.js";
import { useItemDrag } from "./drag-context.js";
import { ItemGap } from "./ItemGap.js";
import { ProseItem } from "./ProseItem.js";
import { RemoveItem } from "./RemoveItem.js";
import { moveWithin } from "./item-drag.js";
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
  const store = useStore();
  const drag = useItemDrag();
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

  /**
   * Two entries the author says are really one.
   *
   * D&D Beyond is told nothing: the section is stored as one string and the
   * entries are cut out of it at each bold lead-in, so joining two of them back
   * up produces the very same string. Which is also the limit of it — a merge
   * lasts as long as the session, and a section re-read from D&D Beyond's own
   * textarea is cut at the bold lead-ins again.
   *
   * The merged entry gets a fresh id so its editor is built anew around both
   * halves, with an undo history that starts here rather than in one of them.
   */
  const mergeRows = (index: number) => {
    const above = live.current[index - 1];
    const below = live.current[index];
    if (!above || !below) return;
    const merged = { id: nextId(), html: above.html + below.html };
    const next = [...live.current.slice(0, index - 1), merged, ...live.current.slice(index + 1)];
    live.current = next;
    setRows(next);
  };

  const removeRow = (id: number) => {
    // The last entry stays. An author who clears a section's only trait is
    // usually about to retype it, and pulling the editor out from under them
    // would be the same mistake the section-level reveal exists to avoid.
    if (live.current.length <= 1) return;
    write(live.current.filter((row) => row.id !== id));
  };

  /** Puts the keyboard back where the author left it: on the entry that moved. */
  const focusHandle = (id: number) =>
    listRef.current?.querySelector<HTMLElement>(`[data-drag-handle="${id}"]`)?.focus();

  /**
   * What the drag is allowed to do to this section. Registered rather than
   * passed down because the other end of a drag is *another* section's list,
   * and the two only meet in the controller.
   *
   * Every operation reads `live` rather than `rows`, so the handle registered on
   * the first render is still telling the truth on the hundredth.
   */
  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    return drag.register({
      section,
      element,
      count: () => live.current.length,
      indexOf: (id) => live.current.findIndex((row) => row.id === id),
      take: (id) => {
        const row = live.current.find((r) => r.id === id);
        if (!row) return "";
        const rest = live.current.filter((r) => r.id !== id);
        // A section emptied by dragging its last entry away would stop being
        // printed mid-gesture, taking its heading with it. Held open instead,
        // the way a section added from the menu is, with somewhere to type.
        if (rest.length === 0) {
          store.update({ revealedSections: revealSection(store.getSession(), section) });
          write([{ id: nextId(), html: "" }]);
        } else {
          write(rest);
        }
        return row.html;
      },
      insert: (html, index, focus) => {
        const row = { id: nextId(), html };
        const next = [...live.current];
        // An entry that arrives is the only thing in a section that was being
        // held open empty; it takes that row's place rather than sitting under
        // it.
        if (next.length === 1 && !next[0]!.html) next.length = 0;
        next.splice(Math.min(index, next.length), 0, row);
        write(next);
        if (focus) focusHandle(row.id);
      },
      move: (id, index) => {
        const from = live.current.findIndex((row) => row.id === id);
        const next = moveWithin(live.current, from, index);
        // Dropped back where it was: nothing to write, and nothing to save.
        if (next.every((row, i) => row === live.current[i])) return;
        write(next);
      },
      focusHandle,
    });
    // `section` never changes for a mounted list, and everything else is read
    // through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, section]);

  return (
    <div class="sb-section-list" data-section={section} ref={listRef}>
      {rows.flatMap((row, index) => {
        // Read once per row, the way `autoFocus` has always been read: a later
        // re-render must never steal the caret back.
        const claimFocus = focusables.current.delete(row.id);
        return [
          // The band above this entry. The one above the *first* entry joins
          // nothing, so it offers nothing — it is there to be dropped into.
          <ItemGap
            key={`gap-${index}`}
            section={section}
            index={index}
            label={itemLabel}
            onMerge={index > 0 ? () => mergeRows(index) : undefined}
          />,
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
            <DragHandle section={section} id={row.id} label={itemLabel} />
            {rows.length > 1 ? (
              <RemoveItem
                label={itemLabel}
                hasContent={htmlHasContent(row.html)}
                onRemove={() => removeRow(row.id)}
              />
            ) : null}
          </ProseItem>,
        ];
      })}
      {/* The band under the last entry, which is what separates the section
          from the button that adds another. */}
      <ItemGap key={`gap-${rows.length}`} section={section} index={rows.length} label={itemLabel} />
      <button type="button" class="sb-add sb-add-item" onClick={addRow}>
        <Icon name="add" size={16} />
        {`Add ${itemLabel}`}
      </button>
    </div>
  );
}
