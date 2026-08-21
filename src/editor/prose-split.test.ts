/**
 * Ending an item with a blank line.
 *
 * The promise these are about is the same one `section-items.test.ts` makes one
 * level up: the cut is a *partition*. Whatever the two halves are, putting them
 * back together is the item that was there — anything invented or dropped here
 * would be a creature quietly corrupted on the next save.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProseEditor } from "./prose-editor.js";

/** Lexical commits a dispatched command a microtask later. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(t: { after: (fn: () => void) => void }, html: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const splits: Array<{ remaining: string; moved: string }> = [];
  const editor = new ProseEditor({
    name: `split-${Math.random()}`,
    initialHtml: html,
    onCommit: () => {},
    onSplit: (remaining, moved) => splits.push({ remaining, moved }),
  });
  editor.mount(host);
  t.after(() => {
    editor.destroy();
    host.remove();
  });
  return { host, editor, splits };
}

const enter = async (host: HTMLElement, init: KeyboardEventInit = {}) => {
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init }));
  await settle();
};

/** The text of each block, which is what survives whatever markup Lexical uses. */
const blocks = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.children].map((block) => block.textContent);
};

const paragraphs = (host: HTMLElement) => [...host.querySelectorAll("p")].map((p) => p.textContent);

/**
 * Puts the caret where a click would, which is the only way to reach the middle
 * of an item: jsdom has no layout, so nothing else moves a caret off the end.
 */
function caretAfter(host: HTMLElement, block: number, offset: number) {
  host.focus();
  const paragraph = host.querySelectorAll("p")[block]!;
  const text = paragraph.firstChild?.firstChild ?? paragraph;
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

test("a blank line at the foot of an item ends it, cutting nothing loose", async (t) => {
  const { host, editor, splits } = mount(t, "<p>Misty Escape.</p><p>It becomes mist.</p>");
  editor.focus();

  await enter(host); // the blank line
  await enter(host); // and the one that ends the entry

  assert.equal(splits.length, 1);
  assert.deepEqual(blocks(splits[0]!.remaining), ["Misty Escape.", "It becomes mist."]);
  assert.equal(splits[0]!.moved, "", "there was nothing under the caret");
  assert.deepEqual(paragraphs(host), ["Misty Escape.", "It becomes mist."], "the blank line goes");
});

test("a blank line in the middle sends what is under it down", async (t) => {
  // The author means the text under the cut to be the new entry's — it is the
  // exact inverse of Merge, and nothing is left stranded above it.
  const { host, splits } = mount(t, "<p>Misty Escape.</p><p>It becomes mist.</p>");
  caretAfter(host, 0, "Misty Escape.".length);

  await enter(host);
  await enter(host);

  assert.equal(splits.length, 1);
  assert.deepEqual(blocks(splits[0]!.remaining), ["Misty Escape."]);
  assert.deepEqual(blocks(splits[0]!.moved), ["It becomes mist."]);
  assert.deepEqual(paragraphs(host), ["Misty Escape."], "and the item keeps only its half");
});

test("the two halves are the item that was there", async (t) => {
  const { host, splits } = mount(t, "<p>One</p><p>Two</p><p>Three</p>");
  caretAfter(host, 1, "Two".length);

  await enter(host);
  await enter(host);

  const { remaining, moved } = splits[0]!;
  assert.deepEqual(blocks(remaining + moved), ["One", "Two", "Three"]);
});

test("one Enter is just a new paragraph", async (t) => {
  const { host, editor, splits } = mount(t, "<p>Misty Escape.</p>");
  editor.focus();

  await enter(host);

  assert.deepEqual(splits, []);
  assert.equal(paragraphs(host).length, 2);
});

test("Enter in an item that was empty to begin with is the first Enter, not the second", async (t) => {
  // Nothing above it means the author has pressed Enter once. A freshly added
  // entry is exactly this, and it must not end itself.
  const { host, editor, splits } = mount(t, "");
  editor.focus();

  await enter(host);

  assert.deepEqual(splits, []);
});

test("Shift+Enter stays inside the item", async (t) => {
  // A soft break is how a trait keeps a line of its own without becoming a
  // separate trait.
  const { host, editor, splits } = mount(t, "<p>Misty Escape.</p>");
  editor.focus();

  await enter(host);
  await enter(host, { shiftKey: true });

  assert.deepEqual(splits, []);
});

test("without an owner listening, Enter is only ever Enter", async (t) => {
  // The Description is prose, not a list: its blank lines are its own.
  const host = document.createElement("div");
  document.body.append(host);
  const editor = new ProseEditor({ name: "prose", initialHtml: "<p>A</p>", onCommit: () => {} });
  editor.mount(host);
  t.after(() => {
    editor.destroy();
    host.remove();
  });
  editor.focus();

  await enter(host);
  await enter(host);

  assert.equal(paragraphs(host).length, 3, "three paragraphs, one item");
});
