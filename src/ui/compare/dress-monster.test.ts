/**
 * The surgery on D&D Beyond's monster page, done to real captures of two.
 *
 * As with the listing's: run against a frame's document rather than a parsed
 * one, because that is what it faces in the overlay and because a document with
 * no browsing context has no computed styles — and part of what this does is a
 * stylesheet.
 *
 * Two captures because there are two renderers. A 2014 creature is printed in
 * `mon-stat-block__…` and a 2024 one in `mon-stat-block-2024__…`, and which the
 * author gets is decided by the creature they went to look at, not by the block
 * they are writing. `EDITIONS` below runs everything that should hold of both
 * over both; the tests after it are about one capture's own particulars.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { SectionKey } from "../../statblock/model.js";
import { dressMonster } from "./dress-monster.js";
import { joinItems, splitItems } from "../prose/section-items.js";
import page from "./__fixtures__/monster-details.html";
import page2024 from "./__fixtures__/monster-details-2024.html";
import listing from "../lookup/__fixtures__/monster-listing.html";
import { isListing } from "../lookup/dress-listing.js";

function compared(t: TestContext, fixture: string = page) {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(fixture);
  doc.close();

  const imports: [SectionKey, string][] = [];
  const taken = new Set<string>(["Charm"]);
  let backs = 0;
  let closes = 0;
  const dispose = dressMonster(doc, {
    onImport: (section, html) => imports.push([section, html]),
    onBack: () => (backs += 1),
    onClose: () => (closes += 1),
    clashes: (_section, name) => taken.has(name),
  });
  t.after(() => {
    dispose();
    frame.remove();
  });

  const win = frame.contentWindow!;
  return {
    doc,
    imports,
    dispose,
    backs: () => backs,
    closes: () => closes,
    /** Interfaces have to come from the frame's own realm, not the test's. */
    click: (element: Element) =>
      element.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })),
    press: (key: string) =>
      doc.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true })),
    hover: (element: Element) =>
      element.dispatchEvent(new win.Event("pointerenter", { bubbles: false })),
    /** The names the live creature is pretending to hold. */
    taken,
    shown: (selector: string) => {
      const element = doc.querySelector(selector);
      return element ? win.getComputedStyle(element).display !== "none" : null;
    },
    /** The block printed under this heading, once it has been banded. */
    block: (heading: string) => {
      for (const block of doc.querySelectorAll(".mb-content")) {
        const title = block.parentElement?.querySelector("[class$='block-heading']")?.textContent;
        if (title?.trim() === heading) return block;
      }
      return null;
    },
  };
}

const entriesOf = (block: Element) => [...block.querySelectorAll(".mb-entry-body")];
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";

test("a creature's page is told from a listing of them", () => {
  const holder = document.createElement("template");
  holder.innerHTML = listing;
  assert.equal(isListing(holder.content as unknown as Document), true);
  holder.innerHTML = page;
  assert.equal(isListing(holder.content as unknown as Document), false);
});

test("a page reached by following a link out of one is left alone, but not a dead end", (t) => {
  // What the frame lands on when the author clicks the `grappled` in a trait.
  const glossary = `<!doctype html><html><body>
    <div class="page-heading"><div class="page-heading__content"><h1>Grappled</h1></div></div>
    <p>A grappled creature's speed becomes 0.</p>
  </body></html>`;
  const view = compared(t, glossary);
  assert.equal(view.doc.querySelectorAll(".mb-content").length, 0, "nothing to band");
  assert.ok(view.doc.querySelector(".microbrewery-nav"), "and still a way back");
  view.click(view.doc.querySelectorAll(".microbrewery-nav button")[0]!);
  assert.equal(view.backs(), 1);
});

/** The same page, printed by each of D&D Beyond's two stat-block renderers. */
const EDITIONS = [
  {
    what: "a 2014 creature",
    fixture: page,
    root: ".mon-stat-block",
    // Its Bonus Actions block is the one the other has and this one hasn't.
    headings: ["Traits", "Actions", "Legendary Actions", "Description"],
    opensWith: "Shapechanger.",
  },
  {
    what: "a 2024 creature",
    fixture: page2024,
    root: ".mon-stat-block-2024",
    headings: ["Traits", "Actions", "Bonus Actions", "Legendary Actions", "Description"],
    opensWith: "Legendary Resistance (3/Day, or 4/Day in Lair).",
  },
];

for (const edition of EDITIONS) {
  test(`every block ${edition.what} prints is banded`, (t) => {
    const view = compared(t, edition.fixture);
    for (const heading of edition.headings) {
      assert.ok(view.block(heading), `${heading} should have been cut into entries`);
    }
    assert.equal(view.doc.querySelectorAll(".mb-content").length, edition.headings.length);
  });

  test(`the entries of ${edition.what} are named, and each gets a button`, (t) => {
    const view = compared(t, edition.fixture);
    const traits = view.block("Traits")!;
    const entries = entriesOf(traits);
    assert.ok(entries.length > 1, "more than one trait, so the split really ran");
    assert.ok(text(entries[0]!).startsWith(edition.opensWith), text(entries[0]!).slice(0, 60));
    assert.equal(traits.querySelectorAll(".mb-import").length, entries.length);
    assert.equal(traits.querySelectorAll(".mb-gap").length, entries.length - 1);
  });

  test(`the cut of ${edition.what} is a partition`, (t) => {
    const view = compared(t, edition.fixture);
    for (const heading of edition.headings) {
      const entries = entriesOf(view.block(heading)!).map((body) => body.innerHTML);
      assert.equal(
        joinItems(splitItems(joinItems(entries))),
        joinItems(entries),
        `${heading} re-splits to itself`,
      );
    }
  });

  test(`merging on ${edition.what} keeps every word`, (t) => {
    const view = compared(t, edition.fixture);
    const actions = view.block("Actions")!;
    const before = entriesOf(actions).map((body) => body.innerHTML);
    view.click(actions.querySelector(".mb-merge")!);
    const after = entriesOf(actions).map((body) => body.innerHTML);
    assert.equal(after.length, before.length - 1);
    assert.equal(joinItems(after), joinItems(before));
  });

  test(`the chrome around ${edition.what} goes, and its stat block stays`, (t) => {
    const view = compared(t, edition.fixture);
    assert.equal(view.shown("#mega-menu-target"), false);
    assert.equal(view.shown(edition.root), true);
    assert.ok(view.doc.querySelector(".microbrewery-nav"), "and the way back is offered");
  });
}

test("an entry that nests its bold and italic the other way round still starts one", (t) => {
  // D&D Beyond writes both. Most entries open `<em><strong>Name.</strong></em>`;
  // a few — Vampire Weakness among them — open `<strong><em>Name.</em></strong>`,
  // and an entry the splitter couldn't see the bold through would be swallowed
  // by the trait above it instead of standing on its own.
  const view = compared(t, page2024);
  const traits = entriesOf(view.block("Traits")!);
  const weakness = traits.find((body) => text(body).startsWith("Vampire Weakness."));

  assert.ok(weakness, `Vampire Weakness should be its own entry, got ${traits.map(text).map((t) => t.slice(0, 22))}`);
  assert.match(weakness!.innerHTML, /<strong><em>/, "and this is the nesting that proves it");
});

test("each block of prose is cut into the entries the editor would cut", (t) => {
  const view = compared(t);
  const traits = view.block("Traits")!;
  assert.equal(entriesOf(traits).length, 6, "six named traits, continuations folded in");
  assert.match(text(entriesOf(traits)[0]!), /^Shapechanger\./);
  // The two unbolded paragraphs after it are the same trait, not two more.
  assert.match(text(entriesOf(traits)[0]!), /While in mist form/);
  assert.match(text(entriesOf(traits)[1]!), /^Legendary Resistance \(3\/Day\)\./);
});

test("an unbolded preamble is an entry of its own", (t) => {
  const view = compared(t);
  const legendary = entriesOf(view.block("Legendary Actions")!);
  assert.equal(legendary.length, 4, "the preamble, then three actions");
  assert.match(text(legendary[0]!), /^The vampire can take 3 legendary actions/);
  assert.match(text(legendary[1]!), /^Move\./);
});

test("a section that isn't a list is one entry whole", (t) => {
  const view = compared(t);
  const description = view.block("Description")!;
  assert.equal(entriesOf(description).length, 1);
  assert.equal(description.querySelectorAll(".mb-gap").length, 0, "nothing to merge");
});

test("the cut is a partition — nothing invented, nothing lost", (t) => {
  const view = compared(t);
  for (const heading of ["Traits", "Actions", "Legendary Actions"]) {
    const block = view.block(heading)!;
    const entries = entriesOf(block).map((body) => body.innerHTML);
    assert.equal(
      joinItems(splitItems(joinItems(entries))),
      joinItems(entries),
      `${heading} re-splits to itself`,
    );
  }
});

test("every entry gets a button, and every join between two gets a band", (t) => {
  const view = compared(t);
  const actions = view.block("Actions")!;
  const count = entriesOf(actions).length;
  assert.equal(actions.querySelectorAll(".mb-import").length, count);
  assert.equal(actions.querySelectorAll(".mb-gap").length, count - 1);
});

test("an entry already on the creature says so, and imports anyway", (t) => {
  const view = compared(t);
  const actions = view.block("Actions")!;
  const buttons = [...actions.querySelectorAll<HTMLButtonElement>(".mb-import")];
  const clash = buttons.find((button) => button.classList.contains("is-clash"));
  assert.ok(clash, "the one whose name the live creature already has");
  assert.match(clash!.title, /already has one called "Charm"/);
  view.click(clash!);
  assert.equal(view.imports.length, 1, "warned, not blocked");
});

test("the warning is asked again as the author reaches for the button", (t) => {
  const view = compared(t);
  const move = [...view.block("Legendary Actions")!.querySelectorAll(".mb-entry")]
    .find((entry) => text(entry).startsWith("Move."))!
    .querySelector<HTMLButtonElement>(".mb-import")!;
  assert.match(move.title, /Add this legendary action to your creature/, "nothing to warn of yet");

  // The creature gains one while the panel is open — often because of the
  // button right beside this one.
  view.taken.add("Move");
  view.hover(move);

  assert.match(move.title, /already has one called "Move"/);
  assert.equal(move.classList.contains("is-clash"), true);
});

test("importing hands over the entry, and the section it was printed under", (t) => {
  const view = compared(t);
  const traits = view.block("Traits")!;
  view.click(traits.querySelector(".mb-import")!);
  const [section, html] = view.imports[0]!;
  assert.equal(section, "traits");
  assert.match(html, /^<p><em><strong>Shapechanger\.<\/strong><\/em>/);
  assert.ok(!html.includes("mb-import"), "the button is not part of the entry");
});

test("merging two entries reads them as one, and the page keeps every word", (t) => {
  const view = compared(t);
  const legendary = view.block("Legendary Actions")!;
  const before = entriesOf(legendary).map((body) => body.innerHTML);
  view.click(legendary.querySelector(".mb-merge")!);
  const after = entriesOf(legendary).map((body) => body.innerHTML);
  assert.equal(after.length, before.length - 1);
  assert.equal(after[0], before[0]! + before[1]!, "the preamble now carries Move");
  assert.equal(joinItems(after), joinItems(before), "and nothing else changed");
  assert.equal(legendary.querySelectorAll(".mb-gap").length, after.length - 1);
});

test("a merged entry is what gets imported", (t) => {
  const view = compared(t);
  const legendary = view.block("Legendary Actions")!;
  view.click(legendary.querySelector(".mb-merge")!);
  view.click(legendary.querySelector(".mb-import")!);
  const [, html] = view.imports[0]!;
  assert.match(html, /legendary actions/);
  assert.match(html, /<strong>Move\.<\/strong>/);
});

test("the page's own chrome is out of the way, the stat block is not", (t) => {
  const view = compared(t);
  assert.equal(view.shown("#mega-menu-target"), false);
  assert.equal(view.shown(".mon-stat-block"), true);
});

test("back and close are offered in the heading, and Escape closes", (t) => {
  const view = compared(t);
  const nav = view.doc.querySelector(".microbrewery-nav")!;
  assert.ok(view.doc.querySelector(".page-heading__content .microbrewery-nav"));
  const [back, close] = [...nav.querySelectorAll("button")];
  view.click(back!);
  assert.equal(view.backs(), 1);
  view.click(close!);
  assert.equal(view.closes(), 1);
  view.press("Escape");
  assert.equal(view.closes(), 2, "one key, the same meaning as in the listing");
});

test("disposing leaves the page as D&D Beyond wrote it, less the banding", (t) => {
  const view = compared(t);
  view.dispose();
  assert.equal(view.doc.querySelector("#microbrewery-compare"), null);
  assert.equal(view.doc.querySelector(".microbrewery-nav"), null);
  view.press("Escape");
  assert.equal(view.closes(), 0, "and deaf to keys it no longer owns");
});
