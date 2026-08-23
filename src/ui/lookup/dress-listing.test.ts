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
import spells from "./__fixtures__/spell-listing.html";
import monsters from "./__fixtures__/monster-listing.html";
import magicItems from "./__fixtures__/magic-item-listing.html";

function listing(t: TestContext, fixture: string = spells) {
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

/**
 * The listings this is asked to dress. Their cells differ — `.spell-cast-time`
 * where the other has `.monster-type` — and nothing the surgery reaches for
 * does, which is the claim these run over both to make.
 */
const LISTINGS = [
  {
    what: "the spell list",
    fixture: spells,
    heading: "Spells",
    slug: "2618887-fireball",
    // Somewhere in the row that is nowhere near its link.
    cell: ".spell-cast-time",
    pick: { name: "Fireball", slug: "fireball", id: 2618887 },
  },
  {
    what: "the monster list",
    fixture: monsters,
    heading: "Monsters",
    slug: "1123087-gnoll-vampire",
    cell: ".monster-type",
    pick: { name: "Gnoll Vampire", slug: "gnoll-vampire", id: 1123087 },
  },
  {
    what: "the magic-item list",
    fixture: magicItems,
    heading: "Magic Items",
    slug: "4606-cloak-of-elvenkind",
    cell: ".item-type",
    pick: { name: "Cloak of Elvenkind", slug: "cloak-of-elvenkind", id: 4606 },
  },
];

for (const listed of LISTINGS) {
  test(`${listed.what}: the top of the page becomes the heading`, async (t) => {
    const page = listing(t, listed.fixture);

    assert.equal(page.shown("#mega-menu-target"), false, "the navigation");
    assert.equal(page.shown(".page-header__extras"), false, "breadcrumbs and the links");
    assert.equal(page.shown("footer.ddb-footer"), false, "the site footer");
    assert.equal(page.doc.querySelector("h1.page-title")?.textContent?.trim(), listed.heading);
    assert.equal(
      page.doc.querySelector(".page-heading__content > .microbrewery-close")?.textContent,
      "Close",
    );
  });

  test(`${listed.what}: no row offers to open any more`, async (t) => {
    const page = listing(t, listed.fixture);
    assert.ok(page.doc.querySelector(".open-indicator"), "they are still there");
    assert.equal(page.shown(".open-indicator"), false, "and none of them shows");
  });

  test(`${listed.what}: clicking anywhere in a row picks what it names`, async (t) => {
    const page = listing(t, listed.fixture);
    page.click(rowFor(page.doc, listed.slug).querySelector(listed.cell)!);

    assert.deepEqual(page.picks, [listed.pick]);
  });
}

test("a monster's portrait doesn't open instead of picking", async (t) => {
  // The icon cell is an anchor to the full-size image with a lightbox bound to
  // it — the one place in a row where a click already meant something. Clicking
  // a row means picking, wherever in the row it lands.
  const page = listing(t, monsters);
  const portrait = rowFor(page.doc, "175326-blood-drinker-vampire").querySelector(
    ".monster-icon a",
  )!;
  assert.ok(portrait.getAttribute("data-lightbox"), "the fixture has one");

  const notPrevented = page.click(portrait);

  assert.equal(notPrevented, false);
  assert.deepEqual(
    page.picks.map((pick) => pick.name),
    ["Blood Drinker Vampire"],
  );
});

test("the ad slots go with the rest of the chrome", async (t) => {
  const page = listing(t);
  assert.equal(page.shown(".ad-container"), false);
});

test("the heading's row ends in a way out", async (t) => {
  const page = listing(t);
  const close = page.doc.querySelector(".page-heading__content > .microbrewery-close");

  assert.equal(close?.textContent, "Close");
  assert.equal(close, page.doc.querySelector(".page-heading__content")?.lastElementChild);

  page.click(close!);
  assert.equal(page.closes(), 1);
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

test("the badge's own link is not the spell's", async (t) => {
  // A legacy row carries a "Legacy" badge whose fine print links to /legacy,
  // inside the same cell as the name. The row's link is the one that points at
  // the row.
  const page = listing(t);
  const legacy = rowFor(page.doc, "2062-delayed-blast-fireball");
  assert.ok(legacy.querySelector(".name a.badge-cta"), "the fixture has one");

  page.click(legacy.querySelector(".name")!);

  assert.equal(page.picks[0]?.name, "Delayed Blast Fireball");
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
