/**
 * Comparing against another creature, from the menu item to the page in the
 * column beside the block.
 *
 * The frame never loads anything — jsdom navigates no iframes — so what is
 * tested here is the loop around it: what opens it, where each step points it,
 * and what it gives the column back afterwards. The surgery on the page it
 * would have loaded is `dress-monster.test.ts`.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { fireEvent } from "@testing-library/preact";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { renderBlock } from "../../test-support/editor.js";
import { LookupController } from "../lookup/lookup-context.js";
import { CompareController } from "./compare-context.js";
import { kindByMacro } from "../../adapter/reference-catalog.js";

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const vampire = (): Monster => ({ ...emptyMonster(), name: "Dread Vampire" });

const VAMPIRE = { name: "Vampire", slug: "vampire", id: 17043 };

function scene(t: TestContext, monster: Monster = vampire()) {
  const compare = new CompareController();
  const lookup = new LookupController();
  const view = renderBlock(t, monster, { compare, lookup });
  return {
    ...view,
    compare,
    lookup,
    frame: () => view.root.querySelector<HTMLIFrameElement>(".cf .sf-frame"),
    /** Opens the block's own kebab and returns its rows. */
    menu: () => {
      fireEvent.click(view.root.querySelector(".name-menu .cm-trigger")!);
      return [...view.root.querySelectorAll<HTMLElement>(".name-menu .cm-item")];
    },
  };
}

test("the kebab offers the comparison, wearing D&D Beyond's own mark", (t) => {
  const view = scene(t);
  const item = view.menu().find((row) => row.textContent?.includes("Compare to"));
  assert.ok(item, "a row for it");
  assert.ok(item!.querySelector(".cm-icon.tone-brand"), "in their red, not the menu's blue");
});

test("choosing it puts their monster list where the artwork was", async (t) => {
  const view = scene(t);
  assert.ok(view.root.querySelector(".sb-image"), "the artwork, to begin with");

  view.menu().find((row) => row.textContent?.includes("Compare to"))!.click();
  await settle();
  view.repaint();

  assert.equal(view.root.querySelector(".sb-image"), null, "which the page takes");
  assert.equal(view.frame()?.getAttribute("src"), "/monsters");
});

test("picking one opens that creature's own page, in the same frame", async (t) => {
  const view = scene(t);
  view.compare.open();
  view.repaint();

  view.compare.pick(VAMPIRE);
  view.repaint();

  assert.equal(view.frame()?.getAttribute("src"), "/monsters/17043-vampire");
  assert.match(view.frame()?.getAttribute("title") ?? "", /^Vampire on D&D Beyond/);
});

test("back returns to the list, and closing gives the column up", async (t) => {
  const view = scene(t);
  view.compare.open();
  view.compare.pick(VAMPIRE);
  view.repaint();

  view.compare.back();
  view.repaint();
  assert.equal(view.frame()?.getAttribute("src"), "/monsters");

  view.compare.close();
  await settle(300);
  view.repaint();
  assert.equal(view.frame(), null);
});

test("back comes back to the search that found the creature", (t) => {
  const view = scene(t);
  view.compare.open();
  // What the frame reports: the author searched inside D&D Beyond's own page.
  view.compare.pick(VAMPIRE, "/monsters?filter-search=vampire");
  view.compare.back();
  view.repaint();

  assert.equal(view.frame()?.getAttribute("src"), "/monsters?filter-search=vampire");
});

test("closing and opening again starts from the top of the list", (t) => {
  const view = scene(t);
  view.compare.open();
  view.compare.pick(VAMPIRE, "/monsters?filter-search=vampire");
  view.compare.close();
  view.compare.open();
  view.repaint();

  assert.equal(view.frame()?.getAttribute("src"), "/monsters");
});

test("re-opening an open comparison keeps the author's place", (t) => {
  const view = scene(t);
  view.compare.open();
  view.compare.pick(VAMPIRE);
  view.compare.open();
  view.repaint();

  assert.equal(view.frame()?.getAttribute("src"), "/monsters/17043-vampire", "not back to the list");
});

test("naming a spell mid-comparison leaves the compared page loaded", (t) => {
  const view = scene(t);
  view.compare.open();
  view.compare.pick(VAMPIRE);
  view.repaint();

  view.lookup.open({
    kind: kindByMacro("spells")!,
    query: "fireb",
    onPick: () => {},
    onCancel: () => {},
  });
  view.repaint();

  // Both frames are mounted; the stylesheet is what puts one over the other, so
  // the comparison is never re-fetched on the way back.
  assert.equal(view.frame()?.getAttribute("src"), "/monsters/17043-vampire");
  assert.equal(
    view.root.querySelector(".sf:not(.cf) .sf-frame")?.getAttribute("src"),
    "/spells?filter-search=fireb",
  );
});

test("a creature the author hasn't got says so, rather than spinning", async (t) => {
  const view = scene(t);
  view.compare.open();
  view.compare.pick(VAMPIRE);
  view.repaint();

  // What a redirect to the marketplace looks like from out here: the frame
  // loads, and its document belongs to somebody else.
  const frame = view.frame()!;
  Object.defineProperty(frame, "contentDocument", { value: null, configurable: true });
  fireEvent.load(frame);
  view.repaint();

  const notice = view.root.querySelector(".sf-barred");
  assert.ok(notice, "an explanation, not a cover that never lifts");
  assert.equal(view.root.querySelector(".sf-cover:not(.sf-barred)"), null, "and no spinner");
  assert.match(notice!.textContent ?? "", /Vampire/);

  fireEvent.click(notice!.querySelector("button")!);
  view.repaint();
  assert.equal(view.frame()?.getAttribute("src"), "/monsters", "with a way back");
});
