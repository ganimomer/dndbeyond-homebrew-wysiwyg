import { test } from "node:test";
import assert from "node:assert/strict";
import { createHeadlessEditor } from "@lexical/headless";
import { $generateNodesFromDOM, $generateHtmlFromNodes } from "@lexical/html";
import { $getRoot, type LexicalEditor } from "lexical";
import { DDB_NODES, RefNode } from "./nodes.js";
import { ddbTextToEditorHtml, editorHtmlToDdbText } from "../adapter/ddb-text.js";

/**
 * The Gear row's pipeline, end to end and without a browser:
 *
 *   DDB text ──ddbTextToEditorHtml──▶ spans ──▶ Lexical nodes
 *   ──▶ spans ──editorHtmlToDdbText──▶ DDB text
 *
 * `prose-roundtrip.test.ts` proves the same for the description sections, whose
 * field is HTML. This one's field is an `<input>`, so the two ends are text —
 * and the flatten that gets back to text is the part with something to prove.
 */

/** The Gear field of D&D Beyond's own Warrior Veteran, verbatim. */
const GEAR =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

function editorWith(text: string): LexicalEditor {
  const editor = createHeadlessEditor({
    namespace: "test",
    nodes: DDB_NODES,
    onError: (error) => {
      throw error;
    },
  });
  editor.update(
    () => {
      const doc = new DOMParser().parseFromString(
        `<body>${ddbTextToEditorHtml(text)}</body>`,
        "text/html",
      );
      const root = $getRoot();
      root.clear();
      root.append(...$generateNodesFromDOM(editor, doc));
    },
    { discrete: true },
  );
  return editor;
}

function commit(editor: LexicalEditor): string {
  let html = "";
  editor.read(() => {
    html = $generateHtmlFromNodes(editor, null);
  });
  return editorHtmlToDdbText(html);
}

test("a gear value survives the editor unchanged", () => {
  assert.equal(commit(editorWith(GEAR)), GEAR);
});

test("a reference picked from the menu commits as the macro DDB stores", () => {
  // What `ProseEditor.insertReference` puts in, said here without the editor's
  // caret machinery: the node itself is what has to come back out as a macro.
  const editor = editorWith("Greatsword");
  editor.update(
    () => {
      const tail = () => $getRoot().getAllTextNodes().at(-1)!;
      tail().selectEnd().insertText(", ");
      tail().insertAfter(new RefNode("Splint Armor", "items", "splint"));
    },
    { discrete: true },
  );

  assert.equal(commit(editor), "Greatsword, [items]splint;Splint Armor[/items]");
});

test("typing beside a reference doesn't get swallowed by it", () => {
  // `RefNode` seals its edges (see nodes.ts); this is that promise, in the row
  // where an author is most likely to lean on it — a comma after every item.
  const editor = editorWith("[items]Greatsword[/items]");
  editor.update(
    () => {
      const ref = $getRoot()
        .getAllTextNodes()
        .find((node) => node instanceof RefNode)!;
      ref.selectEnd().insertText(", Shield");
    },
    { discrete: true },
  );

  assert.equal(commit(editor), "[items]Greatsword[/items], Shield");
});
