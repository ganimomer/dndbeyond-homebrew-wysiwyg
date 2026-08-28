/**
 * Looking a spell up on D&D Beyond, from the menu that asks for one to the
 * reference that lands in the prose.
 *
 * The aside is stood in for rather than rendered: `StatBlock` puts the frame in
 * the artwork's column, and the block's own harness renders into a shadow root,
 * where jsdom refuses to hold a caret (see `ReferenceMenu.test.tsx`). The
 * stand-in renders exactly what the column does, and that the column does it is
 * `StatBlock.test.tsx`'s business.
 *
 * The frame never loads anything: jsdom navigates no iframes. What is tested
 * here is the loop around it — what opens it, what its `src` asks D&D Beyond
 * for, and what a pick and a cancel each leave behind. The surgery on the page
 * it would have loaded is `dress-listing.test.ts`.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fireEvent, renderUi } from "../../test-support/render.js";
import { editorHtmlToDdb } from "../../adapter/ddb-markup.js";
import { ProseItem } from "../prose/ProseItem.js";
import { LookupFrame } from "./LookupFrame.js";
import { LookupController, LookupProvider, useLookupState } from "./lookup-context.js";

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** What `StatBlock` renders in the artwork's column, and nothing else. */
function Aside() {
  const lookup = useLookupState();
  return lookup ? <LookupFrame state={lookup} /> : <p class="artwork">artwork</p>;
}

function scene(t: TestContext, html = "<p>It casts /spell</p>") {
  const lookup = new LookupController();
  const committed: string[] = [];
  const tree = (content: string) => (
    <LookupProvider controller={lookup}>
      <ProseItem name="test" html={content} onCommit={(edited) => committed.push(edited)} />
      <Aside />
    </LookupProvider>
  );
  const { container, rerender } = renderUi(t, tree(html));
  return {
    root: container,
    host: container.querySelector<HTMLElement>(".sb-prose")!,
    lookup,
    committed,
    reload: (next: string) => rerender(tree(next)),
  };
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

/** Puts the caret after the slash command already in the prose, picks the one
 * kind it matches, and types into the box that opens. */
async function ask(view: ReturnType<typeof scene>, prose: string, typed: string) {
  await caretAt(view.host, prose.length);
  fireEvent.click(view.root.querySelector(".rm-option")!);
  await settle();
  fireEvent.input(view.root.querySelector(".rm-filter")!, { target: { value: typed } });
}

const askForASpell = (view: ReturnType<typeof scene>, typed: string) =>
  ask(view, "It casts /spell", typed);

const frame = (root: ParentNode) => root.querySelector<HTMLIFrameElement>(".sf-frame");

async function written(committed: string[]): Promise<string> {
  await settle(600);
  return editorHtmlToDdb(committed[committed.length - 1] ?? "").replace(
    /<span style="white-space: pre-wrap;">([\s\S]*?)<\/span>/g,
    "$1",
  );
}

const FIREBALL = { name: "Fireball", slug: "fireball", id: 2618887 };

test("the menu offers to go and look, and the offer opens their own page", async (t) => {
  const view = scene(t);
  await askForASpell(view, "fireb");

  assert.ok(view.root.querySelector(".artwork"), "the artwork is still there");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  assert.equal(view.root.querySelector(".rm"), null, "the menu gives way to the page");
  assert.equal(view.root.querySelector(".artwork"), null, "and so does the artwork");
  // Already searched for what they had typed, so the lookup opens narrowed.
  assert.equal(frame(view.root)?.getAttribute("src"), "/spells?filter-search=fireb");
});

test("with nothing typed it opens the whole list", async (t) => {
  const view = scene(t);
  await askForASpell(view, "");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  assert.equal(frame(view.root)?.getAttribute("src"), "/spells");
});

test("picking a spell puts the reference where the command was", async (t) => {
  const view = scene(t);
  await askForASpell(view, "fireb");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.lookup.pick(FIREBALL);
  await settle();

  const token = view.host.querySelector(".ref")!;
  assert.equal(token.getAttribute("data-ref"), "spells");
  assert.equal(token.textContent, "Fireball");
  assert.equal(await written(view.committed), "<p>It casts [spells]Fireball[/spells]</p>");
});

test("picking puts the page away and gives the column back", async (t) => {
  const view = scene(t);
  await askForASpell(view, "fireb");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.lookup.pick(FIREBALL);
  assert.ok(frame(view.root), "still mounted while it animates away");

  await settle(400);
  assert.equal(frame(view.root), null);
  assert.ok(view.root.querySelector(".artwork"));
});

test("the page arrives moved, and settles into place", async (t) => {
  // Mounted in the state it animates *from*: a transition out of a style that
  // was never rendered doesn't run, so the panel is placed first and moved a
  // paint later.
  const view = scene(t);
  await askForASpell(view, "fireb");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);

  const panel = view.root.querySelector(".sf")!;
  assert.equal(panel.className, "sf", "off to the side, to begin with");

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await settle();
  assert.equal(view.root.querySelector(".sf")?.className, "sf is-open");
});

test("closing without picking abandons the reference", async (t) => {
  const view = scene(t);
  await askForASpell(view, "fireb");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.lookup.cancel();
  await settle(400);

  assert.equal(view.host.querySelector(".ref"), null, "nothing was inserted");
  assert.equal(view.root.querySelector(".rm"), null, "and the menu doesn't come back");
  // The words the command was made of are gone either way: choosing "Spell…"
  // is what took them out, and that isn't undone by changing your mind about
  // which spell.
  assert.equal(view.host.textContent, "It casts ");
});

test("an edit arriving while the page is open doesn't reset the editor under it", async (t) => {
  // The caret is in D&D Beyond's frame by now, so the usual "are they typing?"
  // guard says no. Reloading here would throw away the point the reference is
  // waiting for.
  const view = scene(t);
  await askForASpell(view, "fireb");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.reload("<p>Something else entirely</p>");
  await settle();
  view.lookup.pick(FIREBALL);
  await settle();

  assert.equal(await written(view.committed), "<p>It casts [spells]Fireball[/spells]</p>");
});

test("equipment is browsed at the one page that serves three compendiums", async (t) => {
  // Gear, armor and weapons have no browse page of their own — `/equipment` is
  // all three at once.
  const view = scene(t, "<p>It wears /equip</p>");
  await ask(view, "It wears /equip", "chain");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  assert.equal(frame(view.root)?.getAttribute("src"), "/equipment?filter-search=chain");
});

test("an armor row writes an armor reference, not an equipment one", async (t) => {
  // Which is the whole reason a pick carries its category: the row two below
  // this one is a weapon, and it takes a different macro again.
  const view = scene(t, "<p>It wears /equip</p>");
  await ask(view, "It wears /equip", "chain");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.lookup.pick({ name: "Chain Mail", slug: "chain-mail", id: 16, category: "heavy-armor" });
  await settle();

  assert.equal(await written(view.committed), "<p>It wears [armor]Chain Mail[/armor]</p>");
});

test("a gear row keeps the kind's own macro", async (t) => {
  const view = scene(t, "<p>It carries /equip</p>");
  await ask(view, "It carries /equip", "abacus");
  fireEvent.click(view.root.querySelector(".rm-lookup")!);
  await settle();

  view.lookup.pick({ name: "Abacus", slug: "abacus", id: 6, category: "adventuring-gear" });
  await settle();

  assert.equal(await written(view.committed), "<p>It carries [equipment]Abacus[/equipment]</p>");
});
