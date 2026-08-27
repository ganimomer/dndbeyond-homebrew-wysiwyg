/**
 * D&D Beyond's own browse page, made into a picker.
 *
 * There is no search endpoint to call — `/api/search` and its typeahead both
 * 404 — so the only entitlement-aware list of an author's spells is the page
 * they would browse themselves. We frame it (same origin, and their
 * `x-frame-options: SAMEORIGIN` permits exactly that) and cut it down to the
 * two things a picker needs: a heading with a way out, and rows that can be
 * clicked.
 *
 * Everything here happens to *their* document, so the rules are narrow. One
 * stylesheet and one button are added, both marked as ours and both removed
 * again by the disposer; nothing existing is deleted, because a search reload
 * throws this whole document away and builds a new one anyway — which is also
 * why this is a function of a document rather than a thing that owns one. It
 * runs again per load.
 *
 * The listing's own columns are left alone. The frame is a narrow column, but
 * it is also a viewport, so D&D Beyond's own responsive rules answer for the
 * width without us second-guessing their layout.
 */

import { makeIcon } from "../shared/icons.js";

/** What a row knows about the thing it names. */
export interface LookupPick {
  /** DDB's own display name — "Delayed Blast Fireball". */
  name: string;
  /** Their URL spelling, without the id: `delayed-blast-fireball`. */
  slug: string;
  /** The numeric id, which is the expensive half of a tooltip, free here. */
  id: number;
  /**
   * What the row says it is, where one listing serves several compendiums —
   * `/equipment` is gear, armor and weapons at once, and the icon says which.
   * `rowTarget` in the catalog turns it into a macro. Absent everywhere else.
   */
  category?: string;
}

export interface ListingHandlers {
  onPick(pick: LookupPick): void;
  onClose(): void;
  /**
   * Whether this row is out of the author's reach, asked once per row as the
   * page is dressed. A row that answers true is marked and stops picking.
   *
   * Absent means don't ask and don't mark, which is the reference picker's
   * case: a spell the author doesn't own is still a perfectly good thing to
   * name in their prose, since the macro resolves for whoever reads the block.
   * Only a panel that needs to *open* the page has to care.
   */
  lock?(pick: LookupPick): Promise<boolean>;
}

const STYLE_ID = "microbrewery-lookup";
const CLOSE_CLASS = "microbrewery-close";
const LOCKED_CLASS = "microbrewery-locked";
const LOCK_CLASS = "microbrewery-lock";
/**
 * A result row, in either of the two shapes D&D Beyond writes them.
 *
 * `.info` is what spells, monsters and magic items use; `/equipment` uses
 * `.list-row` instead. They agree on everything that matters here — a row is a
 * box containing one link to the thing it names — so nothing below has to know
 * which it is holding.
 */
const ROW = ".listing .info[data-type][data-slug], .listing .list-row";
/** The tail of a link to a thing: `/spells/2062-delayed-blast-fireball`. */
const NUMBERED = /\/(\d+)-([a-z0-9-]+)\/?$/;
/** `icon equipment-heavy-armor` → `heavy-armor`. */
const CATEGORY = /(?:^|\s)equipment-(\S+)/;

/**
 * What the request asks for, as a stylesheet: no navigation, no page-header
 * extras, no ads and no footer, so the top of the page is the heading; and no
 * open indicator on a row, because the row no longer opens — it picks.
 */
const STYLES = `
#mega-menu-target,
.ad-container,
.page-header__extras,
#footer-push,
#skip-to-content-link,
footer.ddb-footer {
  display: none !important;
}

.page-heading__content {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.${CLOSE_CLASS} {
  flex: none;
  padding: 6px 16px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffffff;
  font: inherit;
  font-size: 15px;
  line-height: 1.4;
  cursor: pointer;
}
.${CLOSE_CLASS}:hover {
  background: rgba(0, 0, 0, 0.6);
}

.listing .info,
.listing .list-row {
  cursor: pointer !important;
}
.listing .info:hover,
.listing .list-row:hover {
  background: rgba(21, 121, 188, 0.08) !important;
}

/* A row D&D Beyond won't open for this author. It keeps its place in the list,
 * because knowing the creature exists is worth something — it just stops
 * offering to be picked. */
.listing .${LOCKED_CLASS} {
  opacity: 0.45;
  cursor: default !important;
}
.listing .${LOCKED_CLASS}:hover {
  background: none !important;
}

/* Over the corner of the portrait, at the row's left end. Positioned against
 * the icon cell rather than the row so it lands in the same place whatever the
 * listing's own columns are doing. */
.listing .${LOCKED_CLASS} .monster-icon,
.listing .${LOCKED_CLASS} .list-row-col-icon {
  position: relative;
}
.${LOCK_CLASS} {
  position: absolute;
  left: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.92);
  color: #822000;
}
/* Each dialect names its own: open-indicator on an .info row, and
 * list-row-col-indicator on an equipment one. (No backticks in here: this
 * whole stylesheet is a template literal.) */
.listing .open-indicator,
.listing .list-row-col-indicator {
  display: none !important;
}
`;

/**
 * Reads a row, or nothing if it isn't one we can name.
 *
 * The row's own link is the one pointing at a numbered page — which is the
 * only rule that holds across their listings, and the one that keeps the wrong
 * links out. A row also contains a portrait linking to an image file, and a
 * "Legacy" badge whose fine print links to `/legacy`; neither is numbered, and
 * either would otherwise end up in the sentence.
 */
export function rowPick(row: Element): LookupPick | null {
  for (const link of row.querySelectorAll("a")) {
    const numbered = NUMBERED.exec(link.getAttribute("href") ?? "");
    const name = link.textContent?.trim();
    if (!numbered || !name) continue;
    const category = CATEGORY.exec(row.querySelector(".icon")?.className ?? "")?.[1];
    return category
      ? { name, slug: numbered[2]!, id: Number(numbered[1]), category }
      : { name, slug: numbered[2]!, id: Number(numbered[1]) };
  }
  return null;
}

/**
 * Whether this document is one of D&D Beyond's listings — a page with rows to
 * pick from.
 *
 * For the compare panel, which mounts one frame over two kinds of page and has
 * to know which arrived. Asked here because the answer is `ROW`, and it has to
 * be `ROW` rather than `.listing`: a *creature's* page carries a `.listing` too,
 * for its comments, and dressing that as a picker would put a Close button on a
 * stat block and band nothing.
 */
export function isListing(doc: Document): boolean {
  return !!doc.querySelector(ROW);
}

export function dressListing(doc: Document, handlers: ListingHandlers): () => void {
  /** Cleared by the disposer, so an answer that outlives the page marks nothing. */
  let live = true;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  (doc.head ?? doc.documentElement).appendChild(style);

  // The right end of the h1's own row, which is what `.page-heading__content`
  // is once the rule above lays it out.
  const heading = doc.querySelector(".page-heading__content") ?? doc.querySelector("h1")?.parentElement;
  const close = doc.createElement("button");
  close.type = "button";
  close.className = CLOSE_CLASS;
  close.textContent = "Close";
  close.addEventListener("click", () => handlers.onClose());
  heading?.appendChild(close);

  const onClick = (event: Event) => {
    const row = (event.target as Element | null)?.closest?.(ROW);
    if (!row) return;
    const pick = rowPick(row);
    if (!pick) return;
    // Captured and stopped here, before anything of DDB's runs: a click on a
    // row would otherwise expand it in place, and a click on the name would
    // navigate the frame to the spell's page. Neither is what it means now.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    // A locked row is stopped like any other, and then does nothing: letting
    // DDB's own click through would take the frame to the marketplace.
    if (row.classList.contains(LOCKED_CLASS)) return;
    handlers.onPick(pick);
  };
  doc.addEventListener("click", onClick, true);

  askAboutRows(doc, handlers, () => live);

  // Escape inside the frame, which the parent's own key handling can't see —
  // events don't cross a browsing context, however same-origin it is.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") handlers.onClose();
  };
  doc.addEventListener("keydown", onKeyDown, true);

  return () => {
    live = false;
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    style.remove();
    close.remove();
  };
}

/**
 * Asks about every row, and marks the ones that come back out of reach.
 *
 * Each row is marked as its own answer lands rather than the list being held
 * back for all of them: a sweep of a full page takes about a second, and a
 * list that sat blank for that long to spare the author two greyed rows would
 * be a poor trade. The rows are D&D Beyond's own and readable throughout; they
 * only stop being *clickable* once we know they lead nowhere.
 *
 * `live` is the disposer's flag. A page thrown away mid-sweep leaves answers
 * still in flight, and marking a detached document would be harmless but
 * pointless — worse, the next page's rows would be arriving into a document
 * this one no longer owns.
 */
function askAboutRows(doc: Document, handlers: ListingHandlers, live: () => boolean): void {
  const ask = handlers.lock;
  if (!ask) return;
  for (const row of doc.querySelectorAll(ROW)) {
    const pick = rowPick(row);
    if (!pick) continue;
    void ask(pick)
      .then((locked) => {
        if (locked && live()) lockRow(doc, row);
      })
      // Never rejects by contract, but a picker that stopped dressing rows
      // because one answer went wrong would be a poor way to find that out.
      .catch(() => {});
  }
}

/** Dims one row, says why, and hangs a padlock on its portrait. */
function lockRow(doc: Document, row: Element): void {
  if (row.classList.contains(LOCKED_CLASS)) return;
  row.classList.add(LOCKED_CLASS);
  // The book is the reason, and the row already prints it. Without one — the
  // equipment dialect has no source column — the fact alone still helps.
  const source = row.querySelector(".source")?.textContent?.trim();
  row.setAttribute(
    "title",
    source ? `${source} isn't in your library` : "This isn't in your library",
  );
  const icon = doc.createElement("span");
  icon.className = LOCK_CLASS;
  icon.append(makeIcon("lock", 12, doc));
  (row.querySelector(".monster-icon, .list-row-col-icon") ?? row).append(icon);
}
