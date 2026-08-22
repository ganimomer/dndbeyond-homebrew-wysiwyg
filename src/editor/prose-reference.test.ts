/**
 * Asking an editor for a reference, from the slash to the token in the prose.
 *
 * The editor's half of the feature is three moves: notice that the caret is in
 * a slash command, take that command back out of the text, and put a reference
 * where it was. The taking and the putting are separated by a whole menu — the
 * author picks a type, then picks an entity — and in between the caret is
 * somewhere else entirely, because the entity list has a filter box that needs
 * it. So the point where the reference goes survives as a value, not as a
 * selection.
 *
 * Driven by moving the caret through seeded text rather than by typing, for the
 * reason `prose-split.test.ts` gives: jsdom has no layout and no text input, so
 * a range placed by hand is the only caret there is. What the editor reports is
 * a function of where the caret sits, which is exactly what these move.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProseEditor, type MenuKey, type TriggerState } from "./prose-editor.js";
import { editorHtmlToDdb } from "../adapter/ddb-markup.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(
  t: { after: (fn: () => void) => void },
  html: string,
  options: { menuKeys?: MenuKey[]; splittable?: boolean } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const triggers: Array<TriggerState | null> = [];
  const committed: string[] = [];
  const splits: string[] = [];
  const editor = new ProseEditor({
    name: `ref-${Math.random()}`,
    initialHtml: html,
    onCommit: (edited) => committed.push(edited),
    onTrigger: (state) => triggers.push(state),
    onMenuKey: options.menuKeys && ((key) => (options.menuKeys!.push(key), true)),
    // Only where the test is about the race with it; a section that ends an
    // entry on a blank line is what makes Enter contested in the first place.
    onSplit: options.splittable ? (remaining) => splits.push(remaining) : undefined,
  });
  editor.mount(host);
  t.after(() => {
    editor.destroy();
    host.remove();
  });
  return { host, editor, triggers, committed, splits };
}

/** Puts the caret `offset` characters into the item's only paragraph. */
async function caretAt(host: HTMLElement, offset: number) {
  host.focus();
  const paragraph = host.querySelector("p")!;
  // Lexical wraps a run of text in a span, so the text node is a grandchild —
  // except in an empty paragraph, which has no text node at all.
  const text = paragraph.firstChild?.firstChild ?? paragraph;
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  await settle();
}

/**
 * What DDB's textarea would receive, less one long-standing artefact.
 *
 * Lexical's exporter wraps every plain run of text in a `white-space: pre-wrap`
 * span, which every section on the block already round-trips through — see
 * `prose-roundtrip.test.ts`, which asserts on substance for the same reason.
 * Stripped here so these assertions can read as the sentence the author sees.
 */
const ddb = (editor: ProseEditor) =>
  editorHtmlToDdb(editor.html()).replace(
    /<span style="white-space: pre-wrap;">([\s\S]*?)<\/span>/g,
    "$1",
  );

const latest = (triggers: Array<TriggerState | null>) => triggers[triggers.length - 1];

const GRAPPLED = { macro: "condition", name: "Grappled" };

test("a caret just past a slash reports a command with nothing typed yet", async (t) => {
  const { host, triggers } = mount(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /".length);

  // Not null: there is a menu to show, it just isn't narrowed yet.
  assert.equal(latest(triggers)?.query, "");
});

test("what has been typed since the slash is the query", async (t) => {
  const { host, triggers } = mount(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  assert.equal(latest(triggers)?.query, "con");
});

test("a slash in ordinary prose reports nothing", async (t) => {
  const { host, triggers } = mount(t, "<p>Speed 60/120 ft.</p>");
  await caretAt(host, "Speed 60/120".length);

  assert.deepEqual(triggers.filter(Boolean), [], "a range is not a command");
});

test("a caret past the end of the command withdraws it", async (t) => {
  const { host, triggers } = mount(t, "<p>The target is /con and</p>");
  await caretAt(host, "The target is /con".length);
  assert.ok(latest(triggers), "still in the command");

  await caretAt(host, "The target is /con and".length);
  assert.equal(latest(triggers), null, "the menu closes on its own");
});

test("a command is reported once, not on every caret move inside it", async (t) => {
  // This fires on every keystroke; a menu that re-rendered that often would be
  // the most expensive thing on the block. Same reasoning as `reportFormat`.
  const { host, triggers } = mount(t, "<p>/con</p>");
  await caretAt(host, "/con".length);
  const first = triggers.length;

  await caretAt(host, "/con".length);

  assert.equal(triggers.length, first, "nothing changed, so nothing was said");
});

test("taking the command removes it from the prose", async (t) => {
  const { host, editor } = mount(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  editor.takeSlashCommand();

  assert.equal(ddb(editor), "<p>The target is </p>");
});

test("a reference lands where the command was", async (t) => {
  const { host, editor } = mount(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  editor.insertReference(editor.takeSlashCommand(), GRAPPLED);

  assert.equal(ddb(editor), "<p>The target is [condition]Grappled[/condition]</p>");
});

test("a command that was the whole line still knows where the reference goes", async (t) => {
  // The awkward one: taking `/con` empties the text node it lived in, and
  // Lexical collects it. A point that only knew that node would be pointing at
  // nothing by the time the author picks an entity.
  const { host, editor } = mount(t, "<p>/con</p>");
  await caretAt(host, "/con".length);

  editor.insertReference(editor.takeSlashCommand(), GRAPPLED);

  assert.equal(ddb(editor), "<p>[condition]Grappled[/condition]</p>");
});

test("the reference goes mid-sentence, not at the end of it", async (t) => {
  const { host, editor } = mount(t, "<p>while /con it can see</p>");
  await caretAt(host, "while /con".length);

  editor.insertReference(editor.takeSlashCommand(), GRAPPLED);

  assert.equal(ddb(editor), "<p>while [condition]Grappled[/condition] it can see</p>");
});

test("a reference carries a slug only when its own text doesn't say it", async (t) => {
  const { host, editor } = mount(t, "<p>/</p>");
  await caretAt(host, 1);

  editor.insertReference(editor.takeSlashCommand(), {
    macro: "rules",
    name: "Shape-Shifts",
    slug: "shape-shifting",
  });

  assert.equal(ddb(editor), "<p>[rules]shape-shifting;Shape-Shifts[/rules]</p>");
});

test("inserting a reference is an edit the form gets told about", async (t) => {
  const { host, editor, committed } = mount(t, "<p>/</p>");
  await caretAt(host, 1);

  editor.insertReference(editor.takeSlashCommand(), GRAPPLED);
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.ok(committed.length > 0, "the reference has to reach DDB's textarea");
  assert.ok(committed[committed.length - 1]!.includes('data-ref="condition"'));
});

test("keys reach the menu only while it is open", async (t) => {
  const keys: MenuKey[] = [];
  const { host, editor } = mount(t, "<p>/con</p>", { menuKeys: keys });
  await caretAt(host, "/con".length);

  const arrowDown = () =>
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));

  arrowDown();
  await settle();
  assert.deepEqual(keys, [], "nothing is open to steer");

  editor.setMenuOpen(true);
  arrowDown();
  await settle();
  assert.deepEqual(keys, ["down"]);
});

test("Enter picks from the menu rather than ending the entry", async (t) => {
  // The blank-line split also wants Enter, and it is registered first. A menu
  // that lost this race would end the trait every time an author picked
  // something with the keyboard.
  const { host, editor, splits } = mount(t, "<p>Misty Escape.</p><p></p>", {
    menuKeys: [],
    splittable: true,
  });
  editor.setMenuOpen(true);
  editor.focus();

  host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();

  assert.deepEqual(splits, []);
  assert.ok(ddb(editor).includes("Misty Escape."), "the entry is intact");
});
