/**
 * A single editable description section, backed by a Lexical editor. This is the
 * editable-prose counterpart to the field components: it mounts into a host
 * element the view keeps stable across re-renders, owns its own state, and
 * commits edits back through the adapter — never torn down when the form
 * mutates underneath it.
 *
 * The load/commit path is the exact pipeline the headless test verifies
 * (`prose-roundtrip.test.ts`): the adapter hands us the lossless marker-span
 * HTML (`ddbToEditorHtml` output), we import it into Lexical through our
 * RollNode/RefNode, and on edit we export back to marker-span HTML and let the
 * adapter re-encode it to DDB macros.
 *
 * One editor per *item*, not per section: the list sections are cut into their
 * entries first (see `ui/prose/section-items.ts`), so what arrives here is
 * usually a paragraph or two. `name` only distinguishes editors in Lexical's
 * namespace and in error logs — this class knows nothing about sections.
 *
 * Behavior beyond rich text is still mostly absent (slash commands, link
 * insertion); what it does now expose is the selection's formatting, which is
 * what a floating toolbar needs to light up its B and its I.
 */
import {
  createEditor,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_ENTER_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type EditorState,
  type ElementNode,
  type LexicalEditor,
} from "lexical";
import { $generateNodesFromDOM, $generateHtmlFromNodes } from "@lexical/html";
import { registerRichText } from "@lexical/rich-text";
import { registerHistory, createEmptyHistoryState } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";
import { DDB_NODES } from "./nodes.js";

/** How long to coalesce keystrokes before writing back to the form. */
const COMMIT_DEBOUNCE_MS = 400;

/** The formats the toolbar offers, and reports on. */
export type TextFormat = "bold" | "italic";

/** Which of them the caret is currently sitting in. */
export type FormatState = Readonly<Record<TextFormat, boolean>>;

export const NO_FORMAT: FormatState = { bold: false, italic: false };

export interface ProseEditorOptions {
  /** Distinguishes this editor in Lexical's namespace and in error logs. */
  name: string;
  /** Marker-span HTML for this item's current content (adapter-decoded). */
  initialHtml: string;
  /** Called (debounced) with the item's edited marker-span HTML. */
  onCommit: (editorHtml: string) => void;
  /** Called whenever the caret moves into or out of bold/italic text. */
  onFormat?: (format: FormatState) => void;
  /**
   * The author ended this item with a blank line: what is left of it, and what
   * belongs to the item that should open below it. Leave it off and Enter is
   * just Enter, which is what the Description wants.
   */
  onSplit?: (remainingHtml: string, movedHtml: string) => void;
}

export class ProseEditor {
  private editor: LexicalEditor;
  private dispose: (() => void) | null = null;
  private commitTimer = 0;
  /** Suppresses commits while we programmatically load content. */
  private loading = false;
  /** Last format reported, so an unchanged one isn't reported again. */
  private format: FormatState = NO_FORMAT;

  constructor(private readonly opts: ProseEditorOptions) {
    this.editor = createEditor({
      namespace: `microbrewery-${opts.name}`,
      nodes: DDB_NODES,
      onError: (error) => console.error("[microbrewery] editor error", error),
    });
  }

  /** Binds the editor to `host` and loads the initial content. */
  mount(host: HTMLElement): void {
    // The attribute, not just the property: it is the form that survives
    // environments where contentEditable isn't implemented, and what the CSS
    // and the tests match on. (Same reasoning as the creature name's field.)
    host.setAttribute("contenteditable", "true");
    host.contentEditable = "true";
    this.editor.setRootElement(host);
    this.dispose = mergeRegister(
      registerRichText(this.editor),
      registerHistory(this.editor, createEmptyHistoryState(), 300),
      this.editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        this.markEmptiness(editorState);
        this.reportFormat(editorState);
        if (this.loading) return;
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        this.scheduleCommit();
      }),
      // An update listener alone misses a caret moved by arrow key or click,
      // which changes no node but very much changes what the toolbar should say.
      this.editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          this.reportFormat();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Above rich text's own handler (which registers at editor priority), so
      // that returning true takes the Enter instead of it inserting a third
      // paragraph nobody asked for.
      this.editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => this.onEnter(event),
        COMMAND_PRIORITY_HIGH,
      ),
    );
    this.load(this.opts.initialHtml);
    this.markEmptiness();
  }

  /**
   * Puts the caret in the item, optionally with formats already switched on.
   *
   * A freshly added entry wants `["bold", "italic"]`: every trait and action on
   * a D&D Beyond block opens with its name in bold italic, and an author who has
   * just asked for a new one is about to type exactly that. On a collapsed
   * selection the format command sets what the *next* typed character gets,
   * which is the whole trick.
   */
  focus(formats: readonly TextFormat[] = [], caret: "start" | "end" = "end"): void {
    // Lexical's own `focus()` only sets the *editor's* selection and trusts the
    // reconciler to push that into the DOM selection. That is enough to type
    // into, but it doesn't reliably give the host element DOM focus — and the
    // format toolbar hangs off `:focus-within`, so a caret the browser hasn't
    // acknowledged would leave the author typing bold with nothing saying so.
    this.editor.getRootElement()?.focus({ preventScroll: true });
    // Placed rather than left to Lexical's own `defaultSelection`, which only
    // applies when the editor has no selection at all — and loading content
    // gives it one. `caret` matters for an item that opens with text already in
    // it: the half of an entry a blank line cut loose, whose author had the
    // caret at the head of that text when they made the cut.
    this.editor.update(
      () => {
        const root = $getRoot();
        if (caret === "start") root.selectStart();
        else root.selectEnd();
      },
      { discrete: true },
    );
    // Synchronous, so the formats below have something to apply to. Dispatched
    // here rather than from `focus()`'s completion callback, which only runs if
    // that update had work to do.
    this.editor.focus();
    for (const format of formats) {
      this.editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    }
  }

  /** Turns a format on or off over the selection — the toolbar's buttons. */
  toggleFormat(format: TextFormat): void {
    this.editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  }

  /** True when there is nothing in the item — drives the empty-row reaper. */
  isEmpty(): boolean {
    return this.readEmptiness(this.editor.getEditorState());
  }

  /** True while the user is actively editing (drives the re-sync guard). */
  hasFocus(): boolean {
    const rootEl = this.editor.getRootElement();
    if (!rootEl) return false;
    // Inside a shadow root `document.activeElement` is the host, so resolve the
    // active element against the editor's own root node (shadow root or document).
    const scope = rootEl.getRootNode() as Document | ShadowRoot;
    const active = scope.activeElement;
    return !!active && rootEl.contains(active);
  }

  /**
   * Replaces the editor's content from the form. The caller should skip this
   * while `hasFocus()` so an in-progress edit is never clobbered mid-keystroke.
   * A no-op when the incoming HTML already matches (which, thanks to the codec's
   * byte-stable round-trip, is the case right after the editor's own write-back)
   * so external re-renders don't reset the editor or wipe its undo history.
   */
  setContent(html: string): void {
    let current = "";
    this.editor.read(() => {
      current = $generateHtmlFromNodes(this.editor, null);
    });
    if (current === html) return;
    this.load(html);
  }

  destroy(): void {
    window.clearTimeout(this.commitTimer);
    this.dispose?.();
    this.dispose = null;
    this.editor.setRootElement(null);
  }

  /**
   * Enter on a blank line ends the item.
   *
   * The caret sitting in an empty paragraph that has something above it means
   * the author pressed Enter twice, which is how an editor of this shape has
   * always been told "that entry is finished". Everything else — Enter in the
   * middle of a sentence, Enter in an item that is empty to begin with,
   * Shift+Enter's soft break — is left to rich text to handle as usual.
   */
  private onEnter(event: KeyboardEvent | null): boolean {
    const report = this.opts.onSplit;
    if (!report) return false;
    if (event?.shiftKey) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const blank = selection.anchor.getNode().getTopLevelElement();
    if (!$isParagraphNode(blank) || blank.getTextContentSize() !== 0) return false;
    // Without something above it this is the first Enter, not the second.
    if (blank.getPreviousSibling() === null) return false;
    event?.preventDefault();

    // Cut here, not in an `editor.update()` of our own: a command is dispatched
    // *inside* an update already, and a nested one is deferred — we would read
    // both halves back before either had changed.
    const halves = this.cut(blank);

    // Reported a microtask later, once this update has committed and drawn. The
    // owner answers by mounting an editor and putting the caret in it, and that
    // must not land while this one is still reconciling its own selection.
    queueMicrotask(() => {
      // The pending commit is of content that no longer exists; the report
      // carries both halves and the owner writes the section once.
      window.clearTimeout(this.commitTimer);
      report(halves.remaining, halves.moved);
    });
    return true;
  }

  /**
   * Takes `blank` and everything under it out of the item, and says what the
   * item is left with and what left with it.
   *
   * Whatever was below the caret comes along rather than being stranded above
   * the new entry: an author who splits a trait in the middle means the text
   * under the cut to be the new trait's. It is the exact inverse of Merge.
   *
   * The two halves are cut out of one export of the whole item rather than
   * exported separately, because the exporter's selection-limited mode reports
   * a partly-selected paragraph as the text inside it and loses the `<p>`. One
   * export can't disagree with itself: what it prints is the root's blocks in
   * order, so the blank line's own index is where to cut.
   *
   * Runs inside an active editor update — see `onEnter`.
   */
  private cut(blank: ElementNode): { remaining: string; moved: string } {
    const index = blank.getIndexWithinParent();
    const [remaining, moved] = splitBlocksAt($generateHtmlFromNodes(this.editor, null), index);
    for (const node of blank.getNextSiblings()) node.remove();
    blank.remove();
    const root = $getRoot();
    // An item is never left without a block to put the caret in.
    if (root.getChildrenSize() === 0) root.append($createParagraphNode());
    // And this item hasn't got the caret any more — the item below has, as soon
    // as the owner mounts it. Said out loud, because a selection left behind
    // here is one this editor's reconciler puts back into the DOM *after* the
    // new item has taken focus: the author is dragged back to the entry they
    // just finished, and the new one is reaped as an empty box they left.
    $setSelection(null);
    return { remaining, moved };
  }

  /**
   * Flags an editor with nothing in it, so the CSS can hold its height open and
   * draw a placeholder. A section added from the "Add section" menu starts this
   * way, and an empty contenteditable is otherwise invisible and unclickable.
   */
  private markEmptiness(state: EditorState = this.editor.getEditorState()): void {
    const rootEl = this.editor.getRootElement();
    if (!rootEl) return;
    rootEl.classList.toggle("is-empty", this.readEmptiness(state));
  }

  private readEmptiness(state: EditorState): boolean {
    let empty = false;
    state.read(() => {
      empty = $getRoot().getTextContentSize() === 0;
    });
    return empty;
  }

  /**
   * Tells the toolbar what the caret is sitting in. Only on a change, because
   * this fires on every keystroke and every caret move, and a toolbar that
   * re-rendered that often would be the most expensive thing on the block.
   */
  private reportFormat(state: EditorState = this.editor.getEditorState()): void {
    const report = this.opts.onFormat;
    if (!report) return;
    let next: FormatState = NO_FORMAT;
    state.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      next = { bold: selection.hasFormat("bold"), italic: selection.hasFormat("italic") };
    });
    if (next.bold === this.format.bold && next.italic === this.format.italic) return;
    this.format = next;
    report(next);
  }

  private load(html: string): void {
    this.loading = true;
    this.editor.update(
      () => {
        const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
        const nodes = $generateNodesFromDOM(this.editor, doc);
        const root = $getRoot();
        root.clear();
        // An empty section still needs a block to put the caret in: a bare root
        // has nowhere for typing to land.
        root.append(...(nodes.length ? nodes : [$createParagraphNode()]));
      },
      {
        discrete: true,
        onUpdate: () => {
          this.loading = false;
        },
      },
    );
  }

  private scheduleCommit(): void {
    window.clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => {
      let html = "";
      this.editor.read(() => {
        html = $generateHtmlFromNodes(this.editor, null);
      });
      this.opts.onCommit(html);
    }, COMMIT_DEBOUNCE_MS);
  }
}

/**
 * An item's exported HTML as the two halves either side of block `index`, which
 * is dropped.
 *
 * The same partition `ui/prose/section-items.ts` performs on a whole section,
 * one level down: parse, take the blocks as they are, put them back untouched.
 * `<template>` content is inert — no network, no script — and the blocks come
 * straight from our own exporter, so nothing here is rewritten.
 */
function splitBlocksAt(html: string, index: number): [string, string] {
  const template = document.createElement("template");
  template.innerHTML = html;
  const blocks = [...template.content.children].map((block) => block.outerHTML);
  return [blocks.slice(0, index).join(""), blocks.slice(index + 1).join("")];
}
