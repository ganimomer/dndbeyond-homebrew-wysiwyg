/**
 * D&D Beyond's own monster page, made into something to take entries from.
 *
 * The listing picker's counterpart, and the same bargain: it is their page in a
 * same-origin frame, cut down in place rather than copied. What the author gets
 * is the creature exactly as D&D Beyond prints it — which is the point of a
 * comparison — with its Traits and Actions banded into the same entries the
 * live editor would cut them into, each with a button that hands one over.
 *
 * The cut is made over *live nodes*, not over a string. `splitItems` re-parses
 * because the form gives it a string and nothing else; here the elements are
 * already in hand, and moving them keeps whatever D&D Beyond's own scripts
 * bound to them — the tooltip on a `[condition]` link goes on working inside
 * the frame. `leadsWithBold` is shared with the editor's splitter so the two
 * can't disagree about where an entry begins.
 *
 * As with the listing, a load throws this whole document away and builds a new
 * one, so this is a function of a document rather than a thing that owns one,
 * and the disposer only has to undo what would outlive the page: our listeners.
 *
 * It is also where any page that isn't a listing ends up, because the prose in
 * a stat block is full of links and a click on one navigates the frame. Such a
 * page has no blocks to band and is left as it is — but it still gets Back and
 * Close, which is the whole reason the author isn't stranded on it.
 */
import type { SectionKey } from "../../statblock/model.js";
import { LIST_SECTIONS, SECTION_ITEM_LABEL, SECTION_LABEL } from "../prose/section-registry.js";
import { entryName, leadsWithBold } from "../prose/section-items.js";
import { makeIcon } from "../shared/icons.js";
import pageCss from "./compare-page.css";

export interface MonsterHandlers {
  /** Takes one entry onto the creature being edited. */
  onImport(section: SectionKey, html: string): void;
  /** Back to the list, to compare against something else. */
  onBack(): void;
  onClose(): void;
  /**
   * Whether the live creature already has an entry of this name — which does
   * not stop the import, only warns about it. Absent while nothing is loaded.
   */
  clashes?(section: SectionKey, name: string): boolean;
}

const STYLE_ID = "microbrewery-compare";
const NAV_CLASS = "microbrewery-nav";
/** How long an imported entry stays lit, in ms. Matches the block's spotlight. */
const FLASH_MS = 1200;

/**
 * The heading a description block prints, lowercased, → the section it is.
 *
 * Built from the editor's own labels, so the page's "Bonus Actions" and the
 * form's `field-bonus-...` textarea are known to be the same thing by the one
 * table that already says so. The monster page prints Characteristics as
 * "Description", which is the spelling `SECTION_LABEL` carries.
 */
const SECTION_BY_LABEL = new Map<string, SectionKey>(
  Object.entries(SECTION_LABEL).map(([key, label]) => [label.toLowerCase(), key as SectionKey]),
);

/** The two shapes a block of prose comes in: the stat block's, and Description's. */
const BLOCKS = ".mon-stat-block__description-block, .mon-details__description-block";
const HEADING = ".mon-stat-block__description-block-heading, .mon-details__description-block-heading";
const CONTENT = ".mon-stat-block__description-block-content, .mon-details__description-block-content";

/**
 * A block's children grouped into entries, by the editor's own rule.
 *
 * The same partition `splitItems` performs, over nodes instead of HTML — and
 * with the same guarantee, since nothing is created or dropped: every child
 * lands in exactly one group, in the order it was in.
 */
function partition(content: Element): ChildNode[][] {
  const groups: ChildNode[][] = [];
  for (const node of [...content.childNodes]) {
    // Whitespace between blocks is presentation in the source, not content.
    if (node.nodeType === 3 && !(node.textContent ?? "").trim()) continue;
    if (groups.length === 0 || leadsWithBold(node)) groups.push([node]);
    else groups[groups.length - 1]!.push(node);
  }
  return groups;
}

/**
 * Bands one block of prose into entries and hangs the controls on them.
 *
 * The bodies are the state: everything on screen is drawn from them, so merging
 * two is splicing the array and drawing again — the same move `SectionList`
 * makes, and like it, a view decision that changes nothing about the page it
 * was read from.
 */
function dressBlock(
  doc: Document,
  content: Element,
  section: SectionKey,
  handlers: MonsterHandlers,
): void {
  const groups = LIST_SECTIONS.has(section)
    ? partition(content)
    : [[...content.childNodes]].filter((group) => group.length > 0);
  if (groups.length === 0) return;

  const bodies = groups.map((nodes) => {
    const body = doc.createElement("div");
    body.className = "mb-entry-body";
    body.append(...nodes);
    return body;
  });

  // What one of these is called inside a sentence — the same table the editor's
  // own "Add trait" button reads, so the two panels name things alike.
  const label = SECTION_ITEM_LABEL[section];

  const importButton = (body: HTMLElement): HTMLButtonElement => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "mb-import";
    // Asked as the author reaches for it, not when the page was banded: the
    // creature they are adding to changes under this panel, not least because
    // of the button beside it.
    const say = () => {
      const name = entryName(body.innerHTML);
      const already = handlers.clashes?.(section, name) === true;
      button.title = already
        ? `Add this ${label} anyway — yours already has one called "${name}"`
        : `Add this ${label} to your creature`;
      button.classList.toggle("is-clash", already);
    };
    say();
    button.addEventListener("pointerenter", say);
    button.addEventListener("focus", say);
    button.append(makeIcon("arrowBack", 16, doc));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onImport(section, body.innerHTML);
      const entry = button.closest(".mb-entry");
      entry?.classList.add("is-imported");
      doc.defaultView?.setTimeout(() => entry?.classList.remove("is-imported"), FLASH_MS);
    });
    return button;
  };

  const render = (focus?: number) => {
    content.replaceChildren();
    bodies.forEach((body, index) => {
      if (index > 0) {
        const gap = doc.createElement("div");
        gap.className = "mb-gap";
        const merge = doc.createElement("button");
        merge.type = "button";
        merge.className = "mb-merge";
        merge.title = `Read these two as one ${label}`;
        merge.append(makeIcon("cellMerge", 14, doc), doc.createTextNode("Merge"));
        merge.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          // Joining two entries is exactly what the editor's own merge does:
          // the page is untouched, only how much of it one button takes.
          bodies[index - 1]!.append(...bodies[index]!.childNodes);
          bodies.splice(index, 1);
          render(index - 1);
        });
        gap.append(merge);
        content.append(gap);
      }
      const entry = doc.createElement("div");
      entry.className = "mb-entry";
      entry.tabIndex = 0;
      entry.append(importButton(body), body);
      content.append(entry);
    });
    // Entries and gaps alternate, entry first, so entry n is child 2n. Focusing
    // the merged one keeps the affordance under the pointer that just used it.
    if (focus !== undefined) (content.children[focus * 2] as HTMLElement | undefined)?.focus();
  };

  content.classList.add("mb-content");
  render();
}

export function dressMonster(doc: Document, handlers: MonsterHandlers): () => void {
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = pageCss;
  (doc.head ?? doc.documentElement).appendChild(style);

  // The right end of the h1's own row, the same hook the listing uses.
  const heading =
    doc.querySelector(".page-heading__content") ?? doc.querySelector("h1")?.parentElement;
  const nav = doc.createElement("div");
  nav.className = NAV_CLASS;
  for (const [text, run] of [
    ["← Back", () => handlers.onBack()],
    ["Close", () => handlers.onClose()],
  ] as const) {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", run);
    nav.append(button);
  }
  heading?.appendChild(nav);

  // Whatever this page turned out to be. A creature's own page bands into
  // entries; a page the author reached by following a link out of one — a
  // condition, a source book — has no blocks and simply keeps the way back.
  for (const block of doc.querySelectorAll(BLOCKS)) {
    const title = block.querySelector(HEADING)?.textContent?.trim().toLowerCase() ?? "";
    const section = SECTION_BY_LABEL.get(title);
    const content = block.querySelector(CONTENT);
    // A heading this editor has no section for is left exactly as DDB drew it:
    // it can still be read, it just can't be taken.
    if (section && content) dressBlock(doc, content, section, handlers);
  }

  // Escape inside the frame, which the parent's own key handling can't see —
  // events don't cross a browsing context, however same-origin it is. It closes
  // rather than going back, so the key means one thing in both panels.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") handlers.onClose();
  };
  doc.addEventListener("keydown", onKeyDown, true);

  return () => {
    doc.removeEventListener("keydown", onKeyDown, true);
    style.remove();
    nav.remove();
  };
}
