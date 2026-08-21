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
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type EditorState,
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
  focus(formats: readonly TextFormat[] = []): void {
    // Lexical's own `focus()` only sets the *editor's* selection and trusts the
    // reconciler to push that into the DOM selection. That is enough to type
    // into, but it doesn't reliably give the host element DOM focus — and the
    // format toolbar hangs off `:focus-within`, so a caret the browser hasn't
    // acknowledged would leave the author typing bold with nothing saying so.
    this.editor.getRootElement()?.focus({ preventScroll: true });
    // Establishes the selection; synchronous, so the formats below have
    // something to apply to. Dispatching them here rather than from `focus()`'s
    // completion callback, which only runs if that update had work to do.
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
