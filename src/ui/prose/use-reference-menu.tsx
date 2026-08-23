/**
 * The two-stage reference menu, and the keyboard it borrows from an editor.
 *
 * This was `ProseItem`'s, and it is out here because Gear wants it too: a
 * one-line field over a plain D&D Beyond `<input>` is not a prose entry in any
 * other respect, but "type a slash, say what kind of thing, pick which one" is
 * the same gesture wherever a reference can go. The editor is passed as the ref
 * its owner already holds, so the hook never outlives it and never owns it.
 *
 * Everything the mounted editor is handed — `onTrigger`, `onMenuKey` — is
 * captured once, at mount, so it must only ever reach state through a setter or
 * a ref. That is what `live` is for.
 */
import type { RefObject, VNode } from "preact";
import { useRef, useState } from "preact/hooks";
import type {
  InsertionPoint,
  MenuKey,
  ProseEditor,
  TriggerState,
} from "../../editor/prose-editor.js";
import {
  kindsMatching,
  rowTarget,
  slugToWrite,
  type ReferenceEntity,
  type ReferenceKind,
} from "../../adapter/reference-catalog.js";
import { useLookup } from "../lookup/lookup-context.js";
import { ReferenceMenu } from "./ReferenceMenu.js";

/**
 * The menu, while it is up.
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

export interface ReferenceMenuControl {
  /** For `ProseEditorOptions.onTrigger`. Stable; safe to capture at mount. */
  onTrigger: (trigger: TriggerState | null) => void;
  /** For `ProseEditorOptions.onMenuKey`. Stable; safe to capture at mount. */
  onMenuKey: (key: MenuKey) => boolean;
  /** Which stage is up, if any — the editor's `setMenuOpen` wants the first. */
  stage: "kinds" | "entities" | null;
  /**
   * True while the caret belongs to something other than the editor: the
   * entity list's filter box, or D&D Beyond's own page in the lookup frame.
   * Reloading the editor's content then would throw away the insertion point
   * the author is still choosing for.
   */
  isAway: () => boolean;
  /** Open the kind list from a control rather than from a slash command. */
  openAt: (anchor: DOMRect) => void;
  /** The menu, for the owner to render inside its own box. */
  node: VNode | null;
}

export function useReferenceMenu(editor: RefObject<ProseEditor | null>): ReferenceMenuControl {
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
   * by then, so this is the only thing left saying the box is mid-gesture.
   */
  const browsing = useRef(false);

  /** Dismisses the menu and gives the caret back to whoever had it. */
  const dismiss = (point?: InsertionPoint | null) => {
    setMenu(null);
    if (point !== undefined) editor.current?.restoreCaret(point);
  };

  /** The author has said what kind of thing. Take the command; show the list. */
  const chooseKind = (kind: ReferenceKind, anchor: DOMRect) => {
    const point = editor.current?.takeInsertionPoint() ?? null;
    setMenu({ stage: "entities", anchor, kind, point });
  };

  const choose = (macro: string, entity: ReferenceEntity, point: InsertionPoint | null) => {
    setMenu(null);
    editor.current?.insertReference(point, {
      macro,
      name: entity.name,
      slug: slugToWrite(entity),
    });
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
        // The row may know better than the kind does: one `/equipment` row is
        // armor and the next is a weapon, and they take different macros.
        const macro = rowTarget(kind, pick.category).macro;
        choose(macro, { name: pick.name, slug: pick.slug }, point);
      },
      onCancel: () => {
        browsing.current = false;
        editor.current?.restoreCaret(point);
      },
    });
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

  return {
    // A slash command opens the kind list, and losing the command closes it
    // — but only the *kind* stage, which is the one the command was steering.
    // Once an entity list is up the command is already gone from the prose.
    onTrigger: (trigger) =>
      setMenu((open) => {
        if (open?.stage === "entities") return open;
        if (!trigger) return null;
        return { stage: "kinds", anchor: trigger.rect, query: trigger.query, active: 0 };
      }),
    onMenuKey: steer,
    stage: menu?.stage ?? null,
    isAway: () => live.current !== null || browsing.current,
    openAt: (anchor) => setMenu({ stage: "kinds", anchor, query: "", active: 0 }),
    node: menu ? (
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
          menu.stage === "entities" && choose(menu.kind.macro, entity, menu.point)
        }
        onLookUp={
          lookup && menu.stage === "entities"
            ? (query) => browse(menu.kind, query, menu.point)
            : undefined
        }
        onDismiss={() => dismiss(menu.stage === "entities" ? menu.point : undefined)}
      />
    ) : null,
  };
}
