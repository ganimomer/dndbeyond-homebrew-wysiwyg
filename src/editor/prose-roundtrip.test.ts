import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * End-to-end verification of the editable-prose pipeline *without a browser*:
 *
 *   DDB macros ──ddbToEditorHtml──▶ spans ──$generateNodesFromDOM──▶ Lexical
 *   nodes ──$generateHtmlFromNodes──▶ spans ──editorHtmlToDdb──▶ DDB macros
 *
 * Run through a real (headless) Lexical editor with our RollNode/RefNode, this
 * proves the roll JSON and reference type/slug survive the editor intact — the
 * property write-back depends on. (Caret/selection UX in the shadow root is the
 * only piece left for an in-browser smoke test.)
 */

// Lexical's DOM export builds elements via the global `document`; back it with
// jsdom before the pipeline runs.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

let createHeadlessEditor: typeof import("@lexical/headless").createHeadlessEditor;
let $generateNodesFromDOM: typeof import("@lexical/html").$generateNodesFromDOM;
let $generateHtmlFromNodes: typeof import("@lexical/html").$generateHtmlFromNodes;
let $getRoot: typeof import("lexical").$getRoot;
let DDB_NODES: typeof import("./nodes.js").DDB_NODES;
let ddbToEditorHtml: typeof import("../adapter/ddb-markup.js").ddbToEditorHtml;
let editorHtmlToDdb: typeof import("../adapter/ddb-markup.js").editorHtmlToDdb;

before(async () => {
  ({ createHeadlessEditor } = await import("@lexical/headless"));
  ({ $generateNodesFromDOM, $generateHtmlFromNodes } = await import("@lexical/html"));
  ({ $getRoot } = await import("lexical"));
  ({ DDB_NODES } = await import("./nodes.js"));
  ({ ddbToEditorHtml, editorHtmlToDdb } = await import("../adapter/ddb-markup.js"));
});

function roundTripThroughEditor(ddbHtml: string): string {
  const editorHtml = ddbToEditorHtml(ddbHtml);
  const editor = createHeadlessEditor({
    namespace: "test",
    nodes: DDB_NODES,
    onError: (e) => {
      throw e;
    },
  });

  editor.update(
    () => {
      const doc = new JSDOM(`<body>${editorHtml}</body>`).window.document;
      const nodes = $generateNodesFromDOM(editor, doc);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    },
    { discrete: true },
  );

  let exported = "";
  editor.read(() => {
    exported = $generateHtmlFromNodes(editor, null);
  });
  return editorHtmlToDdb(exported);
}

const ROLL = `[rollable]+9;{"diceNotation":"1d20+9","rollType":"to hit"}[/rollable]`;
const REF = `[condition]Grappled[/condition]`;
const REF_SLUG = `[rules]shape-shifting;Shape-Shift[/rules]`;

test("a roll's JSON payload survives the editor round-trip", () => {
  const out = roundTripThroughEditor(`<p>${ROLL} to hit</p>`);
  assert.ok(out.includes(ROLL), `expected roll macro preserved, got: ${out}`);
});

test("a reference's type (no slug) survives the editor round-trip", () => {
  const out = roundTripThroughEditor(`<p>The ${REF} condition.</p>`);
  assert.ok(out.includes(REF), `expected reference preserved, got: ${out}`);
});

test("a reference's slug and type survive the editor round-trip", () => {
  const out = roundTripThroughEditor(`<p>uses ${REF_SLUG} to move</p>`);
  assert.ok(out.includes(REF_SLUG), `expected slugged reference preserved, got: ${out}`);
});

test("multiple tokens in one paragraph all survive", () => {
  const out = roundTripThroughEditor(
    `<p><em>Hit:</em> 8 ${ROLL} damage; target gains ${REF}.</p>`,
  );
  assert.ok(out.includes(ROLL) && out.includes(REF), `got: ${out}`);
});

test("prose with no tokens passes through unchanged in substance", () => {
  const out = roundTripThroughEditor(`<p>The vampire makes two attacks.</p>`);
  assert.ok(out.includes("The vampire makes two attacks."), `got: ${out}`);
});
