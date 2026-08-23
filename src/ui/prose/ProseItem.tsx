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
  type InsertionPoint,
  type MenuKey,
  type TextFormat,
} from "../../editor/prose-editor.js";
import {
  kindsMatching,
  slugToWrite,
  type ReferenceEntity,
  type ReferenceKind,
} from "../../adapter/reference-catalog.js";
import { useLookup } from "../lookup/lookup-context.js";
import { FormatToolbar } from "./FormatToolbar.js";
import { ReferenceMenu } from "./ReferenceMenu.js";

/**
 * The reference menu, while it is up.
 *
 * Two shapes because the two stages differ in where the caret is. Choosing a
 * *kind* leaves it in the editor, so what narrows the list is the `/con` still
 * on the page and the highlight has to live out here, where the forwarded keys
 * arrive. Choosing an *entity* happens after the command has been taken back
 * out of the prose, so `point` is the only record of where the reference goes.
 */
type MenuState =
  | { stage: "kinds"; anchor: DOMRect; query: string; active: number }
  | { stage: "entities"; anchor: DOMRect; kind: ReferenceKind; point: InsertionPoint | null };

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
  const [menu, setMenu] = useState<MenuState | null>(null);
  /**
   * The menu as the editor's key handler sees it. A ref rather than the state,
   * because that handler is registered once at mount and would otherwise close
   * over the menu as it was then — permanently closed.
   */
  const live = useRef<MenuState | null>(null);
  live.current = menu;
  const lookup = useLookup();
  /**
   * Whether a reference is waiting on D&D Beyond's own page. The menu is gone
   * by then, so this is the only thing left saying the entry is mid-gesture.
   */
  const browsing = useRef(false);
  /** Held in refs so the editor's one set of callbacks never goes stale. */
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const emptyBlur = useRef(onEmptyBlur);
  emptyBlur.current = onEmptyBlur;
  const split = useRef(onSplit);
  split.current = onSplit;

  /** Dismisses the menu and gives the caret back to whoever had it. */
  const dismiss = (point?: InsertionPoint | null) => {
    setMenu(null);
    if (point !== undefined) editor.current?.restoreCaret(point);
  };

  /**
   * The keys the editor hands over while the kind list is up. Returning false
   * gives one back — Escape with nothing open is still the editor's business.
   */
  const steer = (key: MenuKey): boolean => {
    const open = live.current;
    if (open?.stage !== "kinds") return false;
    const kinds = kindsMatching(open.query);
    switch (key) {
      case "down":
      case "up": {
        if (kinds.length === 0) return true;
        const delta = key === "down" ? 1 : -1;
        const next = (open.active + delta + kinds.length) % kinds.length;
        setMenu({ ...open, active: next });
        return true;
      }
      case "enter": {
        const kind = kinds[open.active];
        if (!kind) return true;
        // Deferred, because this runs inside an editor update: Lexical
        // dispatches a command from within one, and an update started in there
        // is queued rather than run — the same trap `ProseEditor.onEnter`
        // documents. Taken at face value, the insertion point would come back
        // empty, and the reconciler would take the focus back off the filter
        // box a moment after it got it.
        queueMicrotask(() => chooseKind(kind, open.anchor));
        return true;
      }
      case "escape":
      case "tab":
        // Same deferral, and the command itself is left alone: the author asked
        // for the menu to go away, not for what they typed to be edited out
        // from under them.
        queueMicrotask(() => dismiss());
        return true;
    }
  };

  /** The author has said what kind of thing. Take the command; show the list. */
  const chooseKind = (kind: ReferenceKind, anchor: DOMRect) => {
    const point = editor.current?.takeInsertionPoint() ?? null;
    setMenu({ stage: "entities", anchor, kind, point });
  };

  /**
   * Hand the question to D&D Beyond and take the menu off screen. Closing their
   * page without picking abandons the reference — so the caret, not the menu,
   * is what comes back.
   */
  const browse = (kind: ReferenceKind, query: string, point: InsertionPoint | null) => {
    if (!lookup) return;
    setMenu(null);
    browsing.current = true;
    lookup.open({
      kind,
      query,
      onPick: (pick) => {
        browsing.current = false;
        choose(kind, { name: pick.name, slug: pick.slug }, point);
      },
      onCancel: () => {
        browsing.current = false;
        editor.current?.restoreCaret(point);
      },
    });
  };

  const choose = (kind: ReferenceKind, entity: ReferenceEntity, point: InsertionPoint | null) => {
    setMenu(null);
    editor.current?.insertReference(point, {
      macro: kind.macro,
      name: entity.name,
      slug: slugToWrite(entity),
    });
  };

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const created = new ProseEditor({
      name,
      initialHtml: html,
      onCommit: (edited) => commit.current(edited),
      onFormat: setFormat,
      // A slash command opens the kind list, and losing the command closes it
      // — but only the *kind* stage, which is the one the command was steering.
      // Once an entity list is up the command is already gone from the prose.
      onTrigger: (trigger) =>
        setMenu((open) => {
          if (open?.stage === "entities") return open;
          if (!trigger) return null;
          return { stage: "kinds", anchor: trigger.rect, query: trigger.query, active: 0 };
        }),
      onMenuKey: (key) => steer(key),
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
    editor.current?.setMenuOpen(menu?.stage === "kinds");
  }, [menu?.stage]);

  useLayoutEffect(() => {
    const current = editor.current;
    if (!current) return;
    // Never while they're typing — that is what the old render guard was for.
    // And never while the reference menu is up, or while a lookup is out: both
    // hold the caret somewhere that isn't this editor, so `hasFocus` is false
    // there, and reloading would throw away the insertion point the author is
    // still choosing for.
    if (current.hasFocus() || live.current || browsing.current) return;
    current.setContent(html);
  }, [html, menu]);

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
        onAdd={(anchor) => setMenu({ stage: "kinds", anchor, query: "", active: 0 })}
      />
      {menu ? (
        <ReferenceMenu
          anchor={menu.anchor}
          kind={menu.stage === "entities" ? menu.kind : null}
          kinds={menu.stage === "kinds" ? kindsMatching(menu.query) : []}
          active={menu.stage === "kinds" ? menu.active : -1}
          onHighlight={(index) =>
            setMenu((open) => (open?.stage === "kinds" ? { ...open, active: index } : open))
          }
          onChooseKind={(kind) => chooseKind(kind, menu.anchor)}
          onChoose={(entity) =>
            menu.stage === "entities" && choose(menu.kind, entity, menu.point)
          }
          onLookUp={
            lookup && menu.stage === "entities"
              ? (query) => browse(menu.kind, query, menu.point)
              : undefined
          }
          onDismiss={() => dismiss(menu.stage === "entities" ? menu.point : undefined)}
        />
      ) : null}
      {children}
    </div>
  );
}
