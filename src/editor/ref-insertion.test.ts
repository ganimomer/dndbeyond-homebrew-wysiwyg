import { test } from "node:test";
import assert from "node:assert/strict";
import { createHeadlessEditor } from "@lexical/headless";
import { $generateNodesFromDOM, $generateHtmlFromNodes } from "@lexical/html";
import { $getRoot, type LexicalEditor } from "lexical";
import { DDB_NODES, RefNode } from "./nodes.js";
import { editorHtmlToDdb } from "../adapter/ddb-markup.js";

/**
 * What happens around a reference once it is in the prose — typing against its
 * edges. A `RefNode` is a `TextNode` subclass, so without saying otherwise it
 * behaves like any other run of text and quietly absorbs whatever is typed
 * next to it, turning `[condition]Grappled[/condition]` into
 * `[condition]Grappleds[/condition]`.
 *
 * Asserted on substance rather than bytes, like `prose-roundtrip.test.ts`:
 * Lexical's exporter wraps a plain text node in a `white-space: pre-wrap`
 * span, which every section already round-trips through and which has nothing
 * to do with what is being checked here.
 */

function editorWith(html: string): LexicalEditor {
  const editor = createHeadlessEditor({
    namespace: "test",
    nodes: DDB_NODES,
    onError: (error) => {
      throw error;
    },
  });
  editor.update(
    () => {
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
      const root = $getRoot();
      root.clear();
      root.append(...$generateNodesFromDOM(editor, doc));
    },
    { discrete: true },
  );
  return editor;
}

function exportDdb(editor: LexicalEditor): string {
  let html = "";
  editor.read(() => {
    html = $generateHtmlFromNodes(editor, null);
  });
  return editorHtmlToDdb(html);
}

/** Types `text` with the caret at one end of the item's only reference. */
function typeAtRefEdge(editor: LexicalEditor, edge: "start" | "end", text: string): void {
  editor.update(
    () => {
      const ref = $getRoot()
        .getAllTextNodes()
        .find((node) => node instanceof RefNode);
      assert.ok(ref, "expected a reference in the item");
      const selection = edge === "end" ? ref.selectEnd() : ref.selectStart();
      selection.insertText(text);
    },
    { discrete: true },
  );
}

const GRAPPLED = '<p><span class="ref" data-ref="condition">Grappled</span></p>';

test("typing after a reference doesn't join the reference", () => {
  // The plural is the one that would slip past unnoticed: `Grappleds` is still
  // a plausible-looking word, and the macro around it now names a condition
  // that doesn't exist.
  const editor = editorWith(GRAPPLED);
  typeAtRefEdge(editor, "end", "s");
  const out = exportDdb(editor);
  assert.ok(out.includes("[condition]Grappled[/condition]"), out);
  assert.ok(!out.includes("Grappleds"), out);
});

test("typing before a reference doesn't join the reference", () => {
  const editor = editorWith(GRAPPLED);
  typeAtRefEdge(editor, "start", "un");
  const out = exportDdb(editor);
  assert.ok(out.includes("[condition]Grappled[/condition]"), out);
  assert.ok(!out.includes("unGrappled"), out);
});

test("the reference's own text is still editable", () => {
  // Deliberately not a token: an author must be able to make it read
  // "fireballs", or say "shape-shifts" where the glossary says
  // "Shape-Shifting". Only the *edges* are sealed.
  const editor = editorWith(GRAPPLED);
  editor.update(
    () => {
      const ref = $getRoot()
        .getAllTextNodes()
        .find((node) => node instanceof RefNode);
      assert.ok(ref);
      ref.setTextContent("grappling");
    },
    { discrete: true },
  );
  assert.ok(exportDdb(editor).includes("[condition]grappling[/condition]"));
});
