/**
 * Adding a reference to an entry, from both ends: the slash command typed into
 * the prose, and the "+" in the floating toolbar.
 *
 * Tested through `ProseItem` rather than the menu alone, because what the menu
 * is *for* only exists at that seam — a token in the prose, a caret left in a
 * sensible place, and D&D Beyond's macro on its way to the form. The menu on
 * its own is a list of words.
 *
 * The caret is placed by hand throughout, for the reason `prose-split.test.ts`
 * gives: jsdom has no layout and no text input, so a range built on the DOM is
 * the only caret there is.
 *
 * Rendered into the document rather than a shadow root, which is the one place
 * these depart from the overlay. jsdom's `document.getSelection()` refuses a
 * range whose nodes are inside a shadow root — it reports no ranges at all —
 * and without a selection there is no caret to be in a slash command. Chrome
 * and Firefox both report it, so this is a gap in the test DOM and not in the
 * feature. Nothing here turns on retargeting: the menu's click-away reads
 * `composedPath()`, which in the light DOM is simply the ancestor chain, and
 * takes the same branch either way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderUi } from "../../test-support/render.js";
import { ProseItem } from "./ProseItem.js";
import { editorHtmlToDdb } from "../../adapter/ddb-markup.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function item(t: Parameters<typeof renderUi>[0], html: string) {
  const committed: string[] = [];
  const { container } = renderUi(
    t,
    <ProseItem name="test" html={html} onCommit={(edited) => committed.push(edited)} />,
  );
  const host = container.querySelector<HTMLElement>(".sb-prose")!;
  return { root: container, host, committed };
}

/** Puts the caret `offset` characters into the entry's only paragraph. */
async function caretAt(host: HTMLElement, offset: number) {
  host.focus();
  const paragraph = host.querySelector("p")!;
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

const rows = (root: ParentNode) =>
  [...root.querySelectorAll(".rm-option")]
    .filter((row) => !row.hasAttribute("hidden"))
    .map((row) => row.textContent);

const active = (root: ParentNode) => root.querySelector(".rm-option.is-active")?.textContent;

const menu = (root: ParentNode) => root.querySelector(".rm");

const filter = (root: ParentNode) => root.querySelector<HTMLInputElement>(".rm-filter");

/** The entry's words, as the author reads them off the block. */
const words = (host: HTMLElement) => host.textContent;

/**
 * What DDB's textarea receives, once the debounced write-back has run.
 *
 * Taken from the commit rather than off the live editable, because those are
 * two different documents: Lexical's DOM carries its own bookkeeping
 * (`data-lexical-text`, `dir`), and the exporter's output is the only one the
 * codec is the inverse of. Lexical's `white-space: pre-wrap` wrapper is
 * stripped for legibility — see `prose-roundtrip.test.ts` on why it is not
 * this feature's business.
 */
async function written(committed: string[]): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return editorHtmlToDdb(committed[committed.length - 1] ?? "").replace(
    /<span style="white-space: pre-wrap;">([\s\S]*?)<\/span>/g,
    "$1",
  );
}

const key = (target: Element | null, name: string) =>
  fireEvent.keyDown(target!, { key: name, bubbles: true });

test("a slash offers every kind of reference", async (t) => {
  const { root, host } = item(t, "<p>The target is /</p>");
  await caretAt(host, "The target is /".length);

  assert.deepEqual(rows(root), [
    "Spell…",
    "Monster…",
    "Magic item…",
    "Condition…",
    "Skill…",
    "Sense…",
    "Action…",
    "Weapon property…",
    "Rule…",
    "Vehicle…",
  ]);
});

test("what follows the slash narrows the kinds", async (t) => {
  const { root, host } = item(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  assert.deepEqual(rows(root), ["Condition…"]);
});

test("a slash in ordinary prose opens nothing", async (t) => {
  const { root, host } = item(t, "<p>Speed 60/120 ft.</p>");
  await caretAt(host, "Speed 60/120".length);

  assert.equal(menu(root), null);
});

test("the arrows walk the kinds, wrapping at the ends", async (t) => {
  const { root, host } = item(t, "<p>/</p>");
  await caretAt(host, 1);
  assert.equal(active(root), "Spell…");

  key(host, "ArrowDown");
  assert.equal(active(root), "Monster…");

  key(host, "ArrowUp");
  key(host, "ArrowUp");
  assert.equal(active(root), "Vehicle…", "past the top is the bottom");
});

test("Escape closes the menu and leaves what was typed alone", async (t) => {
  // The author asked for the menu to go away, not for their own words to be
  // edited out from under them.
  const { root, host } = item(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  key(host, "Escape");
  // A microtask, because the key arrives inside an editor update and closing
  // has to wait for that to commit — see `ProseItem.steer`.
  await settle();

  assert.equal(menu(root), null);
  assert.equal(words(host), "The target is /con");
});

test("choosing a kind takes the command out and offers that kind's entities", async (t) => {
  const { root, host } = item(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);

  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  assert.equal(words(host), "The target is ", "the command is gone");
  assert.ok(rows(root).includes("Grappled"));
  assert.equal(filter(root)?.placeholder, "Condition…");
});

test("the entity list filters, and only shows what matches", async (t) => {
  const { root, host } = item(t, "<p>/con</p>");
  await caretAt(host, "/con".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  fireEvent.input(filter(root)!, { target: { value: "gra" } });

  assert.deepEqual(rows(root), ["Grappled"]);
});

test("choosing an entity leaves a reference in the prose", async (t) => {
  const { root, host, committed } = item(t, "<p>The target is /con</p>");
  await caretAt(host, "The target is /con".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  fireEvent.input(filter(root)!, { target: { value: "grappled" } });
  fireEvent.click([...root.querySelectorAll(".rm-option")].find((r) => !r.hasAttribute("hidden"))!);
  await settle();

  assert.equal(menu(root), null);
  assert.equal(words(host), "The target is Grappled");
  assert.equal(await written(committed), "<p>The target is [condition]Grappled[/condition]</p>");
});

test("a reference arrives already underlined and already hoverable", async (t) => {
  // Which is the whole point of inserting a RefNode rather than plain text:
  // the stat-block CSS and the tooltip resolver both key on these attributes,
  // and neither needed changing.
  const { root, host } = item(t, "<p>/con</p>");
  await caretAt(host, "/con".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();
  fireEvent.input(filter(root)!, { target: { value: "grappled" } });
  key(filter(root), "Enter");
  await settle();

  const token = host.querySelector(".ref")!;
  assert.equal(token.getAttribute("data-ref"), "condition");
  assert.equal(token.textContent, "Grappled");
});

test("Enter takes the highlighted kind rather than ending the entry", async (t) => {
  const { root, host } = item(t, "<p>/con</p>");
  await caretAt(host, "/con".length);

  key(host, "Enter");
  await settle();

  assert.ok(filter(root), "the condition list is up");
});

test("the toolbar's + reaches the same menu", async (t) => {
  const { root, host } = item(t, "<p>The target is now</p>");
  await caretAt(host, "The target is ".length);

  fireEvent.click(root.querySelector('[aria-label="Add…"]')!);
  await settle();

  assert.deepEqual(rows(root)[0], "Spell…");
});

test("a reference added from the toolbar lands at the caret", async (t) => {
  const { root, host, committed } = item(t, "<p>The target is now</p>");
  await caretAt(host, "The target is ".length);

  fireEvent.click(root.querySelector('[aria-label="Add…"]')!);
  await settle();
  fireEvent.click([...root.querySelectorAll(".rm-option")].find((r) => r.textContent === "Condition…")!);
  await settle();
  fireEvent.input(filter(root)!, { target: { value: "grappled" } });
  key(filter(root), "Enter");
  await settle();

  assert.equal(
    await written(committed),
    "<p>The target is [condition]Grappled[/condition]now</p>",
  );
});

test("a spell is named rather than picked from a list", async (t) => {
  // There is no list to pick from: D&D Beyond has no search endpoint, and the
  // spells an author owns aren't knowable offline.
  const { root, host } = item(t, "<p>It casts /spell</p>");
  await caretAt(host, "It casts /spell".length);

  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  assert.deepEqual(rows(root), [], "no rows to offer");
  assert.equal(filter(root)?.placeholder, "Spell…");
});

test("a typed spell name becomes a reference on Enter", async (t) => {
  const { root, host, committed } = item(t, "<p>It casts /spell</p>");
  await caretAt(host, "It casts /spell".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  fireEvent.input(filter(root)!, { target: { value: "Fireball" } });
  key(filter(root), "Enter");
  await settle();

  assert.equal(menu(root), null);
  assert.equal(words(host), "It casts Fireball");
  // DDB's own spelling: the display text slugifies to the target, so the macro
  // needs no slug of its own.
  assert.equal(await written(committed), "<p>It casts [spells]Fireball[/spells]</p>");
});

test("an empty name commits nothing", async (t) => {
  const { root, host } = item(t, "<p>It casts /spell</p>");
  await caretAt(host, "It casts /spell".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  key(filter(root), "Enter");
  await settle();

  assert.ok(filter(root), "the menu is still asking");
  assert.equal(host.querySelector(".ref"), null);
});

test("an edit arriving while the menu is up doesn't reset the editor under it", async (t) => {
  // The entity stage holds the caret in its filter box, so the usual "are they
  // typing?" guard says no. Reloading here would throw away the insertion point
  // the author is in the middle of choosing for.
  const committed: string[] = [];
  const { container: root, rerender } = renderUi(
    t,
    <ProseItem name="test" html="<p>/con</p>" onCommit={(e) => committed.push(e)} />,
  );
  const host = root.querySelector<HTMLElement>(".sb-prose")!;
  await caretAt(host, "/con".length);
  fireEvent.click(root.querySelector(".rm-option")!);
  await settle();

  rerender(
    <ProseItem name="test" html="<p>Something else entirely</p>" onCommit={(e) => committed.push(e)} />,
  );
  await settle();
  fireEvent.input(filter(root)!, { target: { value: "grappled" } });
  key(filter(root), "Enter");
  await settle();

  assert.equal(await written(committed), "<p>[condition]Grappled[/condition]</p>");
});
