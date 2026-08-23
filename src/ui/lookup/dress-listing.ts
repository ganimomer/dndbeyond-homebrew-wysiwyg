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

/** What a row knows about the thing it names. */
export interface LookupPick {
  /** DDB's own display name — "Delayed Blast Fireball". */
  name: string;
  /** Their URL spelling, without the id: `delayed-blast-fireball`. */
  slug: string;
  /** The numeric id, which is the expensive half of a tooltip, free here. */
  id: number;
}

export interface ListingHandlers {
  onPick(pick: LookupPick): void;
  onClose(): void;
}

const STYLE_ID = "microbrewery-lookup";
const CLOSE_CLASS = "microbrewery-close";
/** A result row. Both attributes are DDB's, and both are load-bearing. */
const ROW = ".listing .info[data-type][data-slug]";
/** `2062-delayed-blast-fireball` — the id and the slug, in one attribute. */
const NUMBERED = /^(\d+)-(.+)$/;

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

.listing .info {
  cursor: pointer !important;
}
.listing .info:hover {
  background: rgba(21, 121, 188, 0.08) !important;
}
.listing .info .open-indicator {
  display: none !important;
}
`;

/** Reads a row, or nothing if it isn't one we can name. */
export function rowPick(row: Element): LookupPick | null {
  const numbered = NUMBERED.exec(row.getAttribute("data-slug") ?? "");
  if (!numbered) return null;
  // The row's own link, by where it points — not the `.name` cell's text, which
  // also holds the concentration marker and a "Legacy" badge whose fine print
  // is itself a link ("Learn More"). Either would end up in the sentence.
  const slug = row.getAttribute("data-slug")!;
  const links = [...row.querySelectorAll(".name a")];
  const link = links.find((a) => (a.getAttribute("href") ?? "").includes(slug)) ?? links[0];
  const name = link?.textContent?.trim();
  if (!name) return null;
  return { name, slug: numbered[2]!, id: Number(numbered[1]) };
}

export function dressListing(doc: Document, handlers: ListingHandlers): () => void {
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
    handlers.onPick(pick);
  };
  doc.addEventListener("click", onClick, true);

  // Escape inside the frame, which the parent's own key handling can't see —
  // events don't cross a browsing context, however same-origin it is.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") handlers.onClose();
  };
  doc.addEventListener("keydown", onKeyDown, true);

  return () => {
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
    style.remove();
    close.remove();
  };
}
