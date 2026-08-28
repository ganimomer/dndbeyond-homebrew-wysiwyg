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
import equipment from "./__fixtures__/equipment-listing.html";

interface ListingOptions {
  /** Supplied only by the tests about locking; every other test asks nothing. */
  lock?: (pick: LookupPick) => Promise<boolean>;
}

function listing(t: TestContext, fixture: string = spells, options: ListingOptions = {}) {
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
    ...(options.lock ? { lock: options.lock } : {}),
  });
  t.after(() => {
    dispose();
    frame.remove();
  });

  const win = frame.contentWindow as Window & typeof globalThis;
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
    dimmed: (element: Element) => Number(win.getComputedStyle(element).opacity) < 1,
  };
}

/** Lets every pending `lock` answer land before the assertions read the rows. */
const swept = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The rows, by the thing each one names — in whichever dialect that listing is
 * written in. `.info` carries the slug as an attribute; a `.list-row` carries
 * it in a class of its own (`list-row-equipment-16-chain-mail`).
 */
const rowFor = (doc: Document, slug: string) =>
  (doc.querySelector(`.info[data-slug="${slug}"]`) ??
    doc.querySelector(`.list-row[class$="${slug}"]`))!;

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
    indicator: ".open-indicator",
    pick: { name: "Fireball", slug: "fireball", id: 2618887 },
  },
  {
    what: "the monster list",
    fixture: monsters,
    heading: "Monsters",
    slug: "1123087-gnoll-vampire",
    cell: ".monster-type",
    indicator: ".open-indicator",
    pick: { name: "Gnoll Vampire", slug: "gnoll-vampire", id: 1123087 },
  },
  {
    what: "the magic-item list",
    fixture: magicItems,
    heading: "Magic Items",
    slug: "4606-cloak-of-elvenkind",
    cell: ".item-type",
    indicator: ".open-indicator",
    pick: { name: "Cloak of Elvenkind", slug: "cloak-of-elvenkind", id: 4606 },
  },
  {
    // The other dialect: `li > .list-row`, and a category on every pick.
    what: "the equipment list",
    fixture: equipment,
    heading: "Equipment",
    slug: "16-chain-mail",
    cell: ".list-row-col-cost",
    indicator: ".list-row-col-indicator",
    pick: {
      name: "Chain Mail",
      slug: "chain-mail",
      id: 16,
      category: "heavy-armor",
    },
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
    assert.ok(page.doc.querySelector(listed.indicator), "they are still there");
    assert.equal(page.shown(listed.indicator), false, "and none of them shows");
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

/**
 * Locking — the compare panel's half, and the only part of this surgery that
 * asks D&D Beyond a question before painting.
 *
 * The rule the rest of these depend on is the first one: with no `lock`, not a
 * row is touched and not a question is asked. That is the reference picker,
 * which shares this whole module and must never grow a sweep.
 */

const BLOOD_DRINKER = "175326-blood-drinker-vampire";
const GNOLL = "1123087-gnoll-vampire";

test("with nothing to ask, no row is marked", async (t) => {
  const view = listing(t, monsters);
  await swept();

  assert.equal(view.doc.querySelector(".microbrewery-locked"), null);
  assert.equal(view.doc.querySelector(".microbrewery-lock"), null);
});

test("the question is only asked when there is something to ask it of", async (t) => {
  // The claim the reference picker rests on: it shares this module and must
  // never make D&D Beyond a request per row for a reference it can write
  // regardless. `lock` absent has to mean *silent*, not merely "unmarked".
  const asked: number[] = [];
  listing(t, monsters, {
    lock: async (pick) => {
      asked.push(pick.id);
      return false;
    },
  });
  await swept();
  assert.ok(asked.length > 0, "a panel that asks, asks about every row");

  asked.length = 0;
  listing(t, monsters);
  await swept();
  assert.deepEqual(asked, [], "and a panel that doesn't, asks nothing at all");
});

test("a row that is out of reach dims, gets a padlock, and names the book", async (t) => {
  const asked: number[] = [];
  const view = listing(t, monsters, {
    lock: async (pick) => {
      asked.push(pick.id);
      return pick.id === 175326;
    },
  });
  await swept();

  const locked = rowFor(view.doc, BLOOD_DRINKER);
  assert.ok(locked.classList.contains("microbrewery-locked"));
  assert.ok(locked.querySelector(".microbrewery-lock svg"), "a padlock over its portrait");
  assert.equal(locked.getAttribute("title"), "Guildmasters’ Guide to Ravnica isn't in your library");
  assert.equal(view.dimmed(locked), true);

  const open = rowFor(view.doc, GNOLL);
  assert.equal(open.classList.contains("microbrewery-locked"), false, "the other is left alone");
  assert.equal(open.querySelector(".microbrewery-lock"), null);
  assert.equal(open.getAttribute("title"), null);

  assert.deepEqual(asked.sort(), [175326, 1123087].sort(), "every row asked, once each");
});

test("a locked row picks nothing, and doesn't let D&D Beyond's own click through", async (t) => {
  const view = listing(t, monsters, { lock: async (pick) => pick.id === 175326 });
  await swept();

  const locked = rowFor(view.doc, BLOOD_DRINKER);
  const link = locked.querySelector("a[href^='/monsters/']")!;
  const handled = !view.click(link);

  assert.deepEqual(view.picks, [], "nothing picked");
  assert.ok(handled, "and the click is still stopped, or the frame would navigate");

  view.click(rowFor(view.doc, GNOLL));
  assert.equal(view.picks.length, 1, "an open row still picks");
});

test("an answer that arrives after the page is gone marks nothing", async (t) => {
  let answer: (locked: boolean) => void = () => {};
  const view = listing(t, monsters, {
    lock: (pick) =>
      pick.id === 175326 ? new Promise<boolean>((resolve) => (answer = resolve)) : Promise.resolve(false),
  });

  view.dispose();
  answer(true);
  await swept();

  assert.equal(view.doc.querySelector(".microbrewery-locked"), null);
});

test("a lock that goes wrong leaves its row alone and the rest of the sweep standing", async (t) => {
  const view = listing(t, monsters, {
    lock: async (pick) => {
      if (pick.id === 175326) throw new Error("no answer");
      return true;
    },
  });
  await swept();

  assert.equal(
    rowFor(view.doc, BLOOD_DRINKER).classList.contains("microbrewery-locked"),
    false,
    "the one that failed is not marked on a guess",
  );
  assert.ok(rowFor(view.doc, GNOLL).classList.contains("microbrewery-locked"), "the rest still ran");
});

test("a listing with no source column still says what it can", async (t) => {
  // `/equipment` is the dialect with no book to name — the row carries a
  // category icon and nothing else.
  const view = listing(t, equipment, { lock: async () => true });
  await swept();

  const locked = view.doc.querySelector(".microbrewery-locked")!;
  assert.ok(locked, "the other row dialect marks too");
  assert.equal(locked.getAttribute("title"), "This isn't in your library");
});
