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
 * Behavior (shortcuts, floating menus, slash commands) is intentionally absent —
 * this is the seam those features attach to later.
 */
import { createEditor, $getRoot, type LexicalEditor } from "lexical";
import { $generateNodesFromDOM, $generateHtmlFromNodes } from "@lexical/html";
import { registerRichText } from "@lexical/rich-text";
import { registerHistory, createEmptyHistoryState } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";
import type { SectionKey } from "../statblock/model.js";
import { DDB_NODES } from "./nodes.js";

/** How long to coalesce keystrokes before writing back to the form. */
const COMMIT_DEBOUNCE_MS = 400;

export interface ProseEditorOptions {
  section: SectionKey;
  /** Marker-span HTML for the section's current content (adapter-decoded). */
  initialHtml: string;
  /** Called (debounced) with the section and its edited marker-span HTML. */
  onCommit: (section: SectionKey, editorHtml: string) => void;
}

export class ProseEditor {
  private editor: LexicalEditor;
  private dispose: (() => void) | null = null;
  private commitTimer = 0;
  /** Suppresses commits while we programmatically load content. */
  private loading = false;

  constructor(private readonly opts: ProseEditorOptions) {
    this.editor = createEditor({
      namespace: `microbrewery-${opts.section}`,
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
      this.editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (this.loading) return;
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        this.scheduleCommit();
      }),
    );
    this.load(this.opts.initialHtml);
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

  private load(html: string): void {
    this.loading = true;
    this.editor.update(
      () => {
        const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
        const nodes = $generateNodesFromDOM(this.editor, doc);
        const root = $getRoot();
        root.clear();
        root.append(...nodes);
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
      this.opts.onCommit(this.opts.section, html);
    }, COMMIT_DEBOUNCE_MS);
  }
}
