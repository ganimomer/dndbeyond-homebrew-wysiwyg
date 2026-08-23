/**
 * The surgery on D&D Beyond's spell listing, done to a real capture of it.
 *
 * Run against a frame's document rather than a parsed one, because that is
 * what it faces in the overlay and because a document with no browsing context
 * has no computed styles — and half of what this does is a stylesheet.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { dressListing, type LookupPick } from "./dress-listing.js";
import fixture from "./__fixtures__/spell-listing.html";

function listing(t: TestContext) {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(fixture);
  doc.close();

  const picks: LookupPick[] = [];
  let closes = 0;
  const dispose = dressListing(doc, {
    onPick: (pick) => picks.push(pick),
    onClose: () => (closes += 1),
  });
  t.after(() => {
    dispose();
    frame.remove();
  });

  const win = frame.contentWindow!;
  return {
    doc,
    picks,
    dispose,
    closes: () => closes,
    /** Interfaces have to come from the frame's own realm, not the test's. */
    click: (element: Element) =>
      element.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })),
    press: (key: string) =>
      doc.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true })),
    shown: (selector: string) => {
      const element = doc.querySelector(selector);
      return element ? win.getComputedStyle(element).display !== "none" : null;
    },
  };
}

/** The rows, by the spell each one names. */
const rowFor = (doc: Document, slug: string) => doc.querySelector(`.info[data-slug="${slug}"]`)!;

test("the top of the page becomes the heading", async (t) => {
  const page = listing(t);

  assert.equal(page.shown("#mega-menu-target"), false, "the navigation");
  assert.equal(page.shown(".ad-container"), false, "the ad slot above it");
  assert.equal(page.shown(".page-header__extras"), false, "breadcrumbs and Create A Spell");
  assert.equal(page.shown("footer.ddb-footer"), false, "the site footer");
  assert.equal(page.doc.querySelector("h1.page-title")?.textContent?.trim(), "Spells");
});

test("the heading's row ends in a way out", async (t) => {
  const page = listing(t);
  const close = page.doc.querySelector(".page-heading__content > .microbrewery-close");

  assert.equal(close?.textContent, "Close");
  assert.equal(close, page.doc.querySelector(".page-heading__content")?.lastElementChild);

  page.click(close!);
  assert.equal(page.closes(), 1);
});

test("no row offers to open any more", async (t) => {
  const page = listing(t);

  assert.equal(page.doc.querySelectorAll(".open-indicator").length, 3, "they are still there");
  assert.equal(page.shown(".open-indicator"), false, "and none of them shows");
});

test("clicking anywhere in a row picks that spell", async (t) => {
  const page = listing(t);
  // The casting-time cell: nowhere near the link, which is the point.
  const row = rowFor(page.doc, "2618887-fireball");
  page.click(row.querySelector(".spell-cast-time")!);

  assert.deepEqual(page.picks, [{ name: "Fireball", slug: "fireball", id: 2618887 }]);
});

test("clicking the name picks it rather than following it", async (t) => {
  const page = listing(t);
  const link = rowFor(page.doc, "2618887-fireball").querySelector("a")!;

  const notPrevented = page.click(link);

  assert.equal(notPrevented, false, "the frame would otherwise navigate to the spell");
  assert.equal(page.picks.length, 1);
});

test("a legacy spell picks its own id, under a name clean of the badge", async (t) => {
  // Both rows are called Delayed Blast Fireball and slug to the same words;
  // only the id says which of them the author actually clicked. The legacy row
  // also carries a "Legacy" badge and a concentration marker inside the same
  // cell as the name, and neither belongs in a sentence.
  const page = listing(t);
  page.click(rowFor(page.doc, "2062-delayed-blast-fireball"));
  page.click(rowFor(page.doc, "2619086-delayed-blast-fireball"));

  assert.deepEqual(page.picks, [
    { name: "Delayed Blast Fireball", slug: "delayed-blast-fireball", id: 2062 },
    { name: "Delayed Blast Fireball", slug: "delayed-blast-fireball", id: 2619086 },
  ]);
});

test("a click that isn't on a row is just a click", async (t) => {
  const page = listing(t);
  page.click(page.doc.querySelector("h1.page-title")!);
  page.click(page.doc.querySelector("#spell-search-form")!);

  assert.deepEqual(page.picks, []);
});

test("Escape in the frame closes it", async (t) => {
  const page = listing(t);
  page.press("Escape");
  assert.equal(page.closes(), 1);

  page.press("a");
  assert.equal(page.closes(), 1);
});

test("disposing leaves the page as it was found", async (t) => {
  // A search reload throws this document away anyway; what matters is that
  // nothing of ours outlives the picker on a document that survives.
  const page = listing(t);
  page.dispose();

  assert.equal(page.doc.querySelector("#microbrewery-lookup"), null);
  assert.equal(page.doc.querySelector(".microbrewery-close"), null);
  assert.equal(page.shown("#mega-menu-target"), true);

  page.click(rowFor(page.doc, "2618887-fireball"));
  assert.deepEqual(page.picks, []);
});
