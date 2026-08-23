/**
 * Clicking a reference to act on it: what the Gear row's chips are made of.
 *
 * `RefNode` is a `TextNode` subclass and this editor has no `NodeSelection`, so
 * "selected" here means a range over exactly that node's text. These check the
 * two things a menu then needs — that it is told *which* node, and that acting
 * on that key rewrites the line the codec will read back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ProseEditor, type RefHit } from "./prose-editor.js";
import { ddbTextToEditorHtml, editorHtmlToDdbText } from "../adapter/ddb-text.js";

/** D&D Beyond's own Warrior Veteran, which is the creature this is aimed at. */
const VETERAN_GEAR =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

function mount(t: { after: (fn: () => void) => void }, gear = VETERAN_GEAR) {
  const host = document.createElement("div");
  document.body.append(host);
  const hits: Array<RefHit | null> = [];
  const commits: string[] = [];
  const editor = new ProseEditor({
    name: `refsel-${Math.random()}`,
    initialHtml: ddbTextToEditorHtml(gear),
    singleLine: true,
    onCommit: (html) => commits.push(editorHtmlToDdbText(html)),
    onRefSelect: (hit) => hits.push(hit),
  });
  editor.mount(host);
  t.after(() => {
    editor.destroy();
    host.remove();
  });
  return { host, editor, hits, commits };
}

/** The `.ref` element showing this text, as the author would click it. */
const chip = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll(".ref")].find((el) => el.textContent === text) as HTMLElement;

const click = (el: HTMLElement) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

test("clicking a reference reports which node it is and what it stands for", (t) => {
  const { host, hits } = mount(t);
  click(chip(host, "Splint Armor"));

  assert.equal(hits.length, 1);
  const hit = hits[0];
  assert.ok(hit);
  assert.equal(hit.token.text, "Splint Armor");
  // The slug DDB's own markup carries, which is what finds it in the table.
  assert.equal(hit.token.slug, "splint");
  assert.equal(hit.token.ref, "items");
  assert.ok(hit.key);
});

test("clicking off a reference reports nothing selected", (t) => {
  const { host, hits } = mount(t);
  click(host);
  assert.deepEqual(hits, [null]);
});

test("each reference reports its own node, not the first one", (t) => {
  const { host, hits } = mount(t);
  click(chip(host, "Greatsword"));
  click(chip(host, "Splint Armor"));
  assert.notEqual(hits[0]?.key, hits[1]?.key);
  assert.equal(hits[0]?.token.text, "Greatsword");
});

test("replacing a reference rewrites just that item, and commits at once", (t) => {
  const { host, editor, hits, commits } = mount(t);
  click(chip(host, "Splint Armor"));

  editor.replaceRef(hits[0]!.key, { macro: "armor", name: "Chain Mail" });

  // Committed without waiting on the typing debounce.
  assert.equal(commits.length, 1);
  assert.equal(
    commits[0],
    "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
      "[armor]Chain Mail[/armor]",
  );
});

test("replacing the middle item leaves its neighbours and commas alone", (t) => {
  const { host, editor, hits, commits } = mount(t);
  click(chip(host, "Heavy Crossbow"));
  editor.replaceRef(hits[0]!.key, { macro: "armor", name: "Plate Armor" });

  assert.equal(
    commits[0],
    "[items]Greatsword[/items], [armor]Plate Armor[/armor], [items]splint;Splint Armor[/items]",
  );
});

test("a stale key replaces nothing and commits nothing", (t) => {
  const { editor, commits } = mount(t);
  editor.replaceRef("no-such-key", { macro: "armor", name: "Chain Mail" });
  assert.deepEqual(commits, []);
});

test("removing a reference takes its separator with it", (t) => {
  const { host, editor, hits, commits } = mount(t);
  click(chip(host, "Heavy Crossbow"));
  editor.removeRef(hits[0]!.key);

  // Not "Greatsword, , Splint Armor".
  assert.equal(
    commits[0],
    "[items]Greatsword[/items], [items]splint;Splint Armor[/items]",
  );
});

test("removing the first reference eats the comma after it instead", (t) => {
  const { host, editor, hits, commits } = mount(t);
  click(chip(host, "Greatsword"));
  editor.removeRef(hits[0]!.key);

  assert.equal(
    commits[0],
    "[items]crossbow, heavy;Heavy Crossbow[/items], [items]splint;Splint Armor[/items]",
  );
});

test("removing the only reference empties the row", (t) => {
  const { host, editor, hits, commits } = mount(t, "[items]splint;Splint Armor[/items]");
  click(chip(host, "Splint Armor"));
  editor.removeRef(hits[0]!.key);
  assert.equal(commits[0], "");
});
