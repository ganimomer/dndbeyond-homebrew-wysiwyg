/**
 * Material icon geometry, inlined so nothing is fetched at runtime.
 *
 * A spec rather than a bare path, because the glyphs don't all share a viewBox:
 * `cell_merge` exists only in Material *Symbols*, which draws on a 960-unit grid
 * with the origin at the baseline. Everything else is the 24×24 legacy set and
 * says nothing.
 *
 * `Icon` renders these as JSX. `makeIcon` builds the same thing as DOM, for the
 * one caller that paints outside the Preact tree (see save-indicator.ts).
 */
export type IconName =
  | "loop"
  | "close"
  | "check"
  | "settings"
  | "syncProblem"
  | "circle"
  | "radioButtonUnchecked"
  | "add"
  | "delete"
  | "image"
  | "formatBold"
  | "formatItalic"
  | "dragIndicator"
  | "cellMerge"
  | "crown"
  | "castle"
  | "openInNew"
  | "monsters"
  | "arrowBack";

export interface IconSpec {
  /** Only when it isn't the legacy set's 24×24 grid. */
  readonly viewBox?: string;
  readonly d: string;
}

/** The grid every Material Icon is drawn on, unless its spec says otherwise. */
export const DEFAULT_VIEWBOX = "0 0 24 24";

/** Material icon name → the geometry that draws it. */
export const ICONS: Record<IconName, IconSpec> = {
  loop: {
    d: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  },
  // crown — a legendary creature, on its chip and on the menu item that makes
  // one. Two subpaths on one `d` (band, then body) because `Icon` draws exactly
  // one <path>; nonzero fill takes them both.
  crown: {
    d: "M4 19h16v2H4zM2 7l5.5 3.5L12 4l4.5 6.5L22 7l-2 10H4L2 7z",
  },
  // castle — a creature with a lair, beside the crown. Two crenellated towers
  // and a taller keep, drawn as one closed outline: the gate is a notch cut out
  // of the bottom edge rather than a second subpath, so it needs no winding
  // rule to punch through.
  castle: {
    d: "M2 21V7h2v2h2V7h2v6h1V3h2v2h2V3h2v10h1V7h2v2h2V7h2v14H14v-5h-4v5H2Z",
  },
  // open_in_new — the one menu item that leaves the editor, for the creature's
  // public page. The arrow out of the box is what says "in a new tab".
  openInNew: {
    d: "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  },
  close: {
    d: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  },
  // check — accepts an inline edit, opposite the ✕ that abandons it.
  check: { d: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" },
  // settings — the gear that opens the hit-points editor.
  settings: {
    d: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  },
  // sync_problem — a failed save, offering a retry.
  syncProblem: {
    d: "M3 12c0-2.21.91-4.2 2.36-5.64L3 4h7v7L7.41 8.41C6.28 9.55 5.5 11.18 5.5 12c0 2.5 1.5 4.7 3.7 5.7l-.8 1.8C5.6 18.2 3 15.4 3 12zm18 0c0 3.4-2.6 6.2-5.4 7.5l-.8-1.8c2.2-1 3.7-3.2 3.7-5.7 0-.82-.78-2.45-1.91-3.59L14 11V4h7l-2.36 2.36C20.09 7.8 21 9.79 21 12zM11 15h2v2h-2v-2zm0-8h2v6h-2V7z",
  },
  // A proficient saving throw, filled like a character sheet's proficiency dot.
  circle: { d: "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2z" },
  // radio_button_unchecked — the same dot, not proficient.
  radioButtonUnchecked: {
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
  },
  // add — the "Add…" menu at the foot of the basics section.
  add: { d: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" },
  // delete — takes a description section back off the block.
  delete: { d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" },
  // image — the two avatar uploads in the artwork's menu.
  image: {
    d: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  },
  // format_bold — the floating toolbar over an editable entry, which is what
  // makes a bold lead-in visible as bold before there is any text to see it in.
  formatBold: {
    d: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z",
  },
  // format_italic — its neighbour in the same toolbar.
  formatItalic: { d: "M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" },
  // drag_indicator — the handle that picks an entry up to reorder it.
  dragIndicator: {
    d: "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  },
  // cell_merge — joins two entries into one. Material Symbols only; the 24×24
  // set has no glyph for it, hence the viewBox.
  cellMerge: {
    viewBox: "0 -960 960 960",
    d: "M120-120v-240h80v160h160v80H120Zm480 0v-80h160v-160h80v240H600ZM287-327l-57-56 57-57H80v-80h207l-57-57 57-56 153 153-153 153Zm386 0L520-480l153-153 57 56-57 57h207v80H673l57 57-57 56ZM120-600v-240h240v80H200v160h-80Zm640 0v-160H600v-80h240v240h-80Z",
  },
  // arrow_back — the import button on a compared entry. It points at the live
  // block, which is the column to its left.
  arrowBack: {
    d: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  },
  // D&D Beyond's own Monsters glyph, the one its Rules menu links with, vendored
  // from `wizardsprod.a.bigcontent.io/v1/static/monsters` so nothing is fetched
  // at runtime — and the one icon here that isn't a Material one, hence the
  // 86×80 grid. Four subpaths on one `d`, like `crown`: the original draws the
  // body and the three facial features separately, and they render identically
  // concatenated (checked pixel for pixel) because none of them is a hole.
  // Coordinates rounded to a tenth of that grid — under a pixel either way at
  // any size this is drawn at, and it halves the string.
  monsters: {
    viewBox: "0 0 86 80",
    d: "M78 26C79.6 25.6 81 25.4 82.9 25.2C83.1 22.1 76.6 18.5 73.8 17.6C76.1 16.7 80.5 14.3 81.3 11.8C79.5 12 78.2 12.1 76.7 12.1C80 8.7 82.4 5.1 82.4 0.4C75.7 5.3 71.4 7.3 63.1 9.7C64.2 7.4 66.4 6.7 68.4 5.4C62.9 4.8 57.9 6.3 53.1 8.4C54.3 6.4 56.1 5.2 58 3.7C55.5 2.8 52.4 4.7 50.4 5.7C50.3 5 50.2 4 50 3.5C49.4 1.9 35 1.4 33.1 3C34 4.4 34.6 5.4 35.3 6.9C31.7 5.6 28.6 4.6 25 4.7C26 5.9 26.8 6.7 27.7 8.1L22.6 5.8C21.1 5.2 19.3 5.1 17.6 5.3C19.4 6.6 21.2 7.3 22.3 9.4C15.2 7.9 8.9 4.5 3.2 0C3.2 5.4 5.5 8 8.6 12L4.2 11.8C5.4 14.5 9.2 16.2 12 17.5C8.5 19 3.8 21.1 2.4 25.2L7.7 26.1C4 30.1-0.6 35.2 0.1 41.1C1.6 39.9 3.1 38.9 4.8 38.1C2.8 43.6 0.4 49.1 2.7 54.9C4.3 53.5 5.7 52.4 7.4 51.2C7.4 54.1 7.1 56.3 7.8 58.8C8.8 62.6 11.3 65.6 14.3 67.9C14.5 65.5 14.7 63.7 15.6 61.7L17.7 65.2C20.2 69.3 24.2 72.1 28.7 74.2C28.6 72.4 28.4 71 28.8 69.5C32.9 74.1 37.3 77.7 42.9 80C48.4 77.6 53 74.1 57 69.5C57.5 71.2 57.2 72.5 57.1 74.3C63.1 71.3 67 67.8 70 61.8C70.7 63.6 71.1 65.5 71.4 67.8C76.8 63.9 79.4 57.8 78.3 51.3C80.2 52.4 81.5 53.5 83.2 55C84.4 50.9 84.2 46.7 82.7 42.6L81 38.3C82.9 39.1 84.1 39.9 85.7 41C86.5 34.8 82 30.1 78 26L78 26ZM48.9 21.6L49.4 22.5C52.4 20.3 53.6 16.6 56.4 14.8C57.3 16.6 56.1 17.6 55.7 19.4L59.3 17.1C61 16.1 65.5 13.4 66.8 15.3C67.9 16.9 65.3 19.1 63.9 19.9L54.1 25.8C52 27.1 48.2 30.3 46.3 28.4C44.9 26.9 47.1 22.6 48.9 21.6V21.6ZM19.8 15C22 13.1 28.3 18.1 30.6 19.4L29.5 16C29.4 15.8 29.5 15.2 29.7 15C29.8 14.9 30.4 15.1 30.6 15.2C33.7 17.9 33.4 19.6 36.7 22.4L37.5 21.3C39.4 22.7 41.7 27 39.6 28.6C37.8 29.9 34.3 27.1 32.3 25.9L24.6 21.2C23 20.2 21.4 19.3 20.1 17.9C19.5 17.2 19 15.7 19.8 15V15ZM33.9 31.1L33.2 33.3C32.6 35.6 30.4 37.1 27.8 37.1C26.6 37.1 25.4 36.7 24.4 36.1C23 35 22.1 33.3 22 31.4C21.9 29.6 22.7 27.8 24 26.8L24.5 25.1L26.6 26.7L32 29.6L33.9 31.1L33.9 31.1ZM49.4 38.9C48.4 45.1 46.6 51 44.1 56.7C43.9 57.2 43.3 57.7 42.9 57.7C42.6 57.8 41.9 57.3 41.7 56.9C38.8 51.6 36.7 45.9 36 39.8C35.8 37.8 36.7 36 38.4 35.1C41.5 33.4 45.5 33.2 48.5 35.3C49.5 36 49.5 37.8 49.4 38.9H49.4ZM55.7 29.4C56.9 28.6 57.9 27.8 58.9 26.7L61.4 24.2L62.6 26.5C63.8 27.7 64.6 29.3 64.6 31.1C64.6 32.9 63.9 34.6 62.5 35.8C61.4 36.8 60 37.4 58.5 37.4C56.4 37.4 54.4 36.3 53.2 34.5L51.1 31.4L54.3 29.4H55.7ZM67.7 43.1C68.9 46.3 69.7 49.1 68.4 52.5C66.5 50.2 64.4 48.4 61.2 47.9C60.5 52.2 58.5 55.8 54.5 57.7C55.1 51.2 56.7 50.6 54 44.5C58.1 44.4 59.2 43.1 64 41.6C68.1 40.3 69.9 33.5 68.4 29.4C67.9 28.1 67.5 27.3 66.7 25.7L69.8 24.2C73.1 27.2 74.4 31.2 74 35.7C73.9 36.8 73.1 37.5 71.7 37.9C73.1 39.7 74.2 41.4 74.5 43.8L67.7 43.1V43.1ZM18.7 43.1L11.9 43.8C12.2 41.4 13.3 39.7 14.7 37.9C13.3 37.5 12.5 36.8 12.4 35.7C12.1 31.2 13.3 27.2 16.7 24.1L19.7 25.7C18.9 27.3 18.5 28.1 18 29.4C16.5 33.5 18.3 40.3 22.5 41.6C27.2 43.1 28.3 44.4 32.5 44.5C29.7 50.6 31.3 51.2 32 57.7C27.9 55.8 26 52.2 25.3 47.9C22.1 48.4 20 50.2 18 52.5C16.8 49.1 17.6 46.3 18.7 43.1V43.1Z M38.5 42.2C37.9 40.5 37.8 38.2 39.6 37.4C39.9 37.3 40.4 37.9 40.5 38.2C40.7 39.8 40 41.2 38.5 42.1V42.2Z M29.7 32.2C29.3 33.6 27.3 34 26.1 33.2C25 32.3 24.8 30.2 25.9 29.3L29.7 32.3V32.2Z M56 32.4C57.5 31.5 58.6 30.5 59.9 29.2C60.9 30.2 60.9 32 59.8 33C58.7 34 56.9 33.7 56 32.4Z",
  },
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The same glyph as DOM, for code that paints outside the Preact tree — the save
 * indicator, which is repainted on its own schedule rather than by a render, and
 * the compare panel, which paints into a frame. Everything else wants `<Icon>`.
 *
 * `doc` is which document to build in: a node made by one document cannot be
 * appended to another, and the compare panel's belongs to the iframe.
 */
export function makeIcon(name: IconName, size = 18, doc: Document = document): SVGSVGElement {
  const { viewBox = DEFAULT_VIEWBOX, d } = ICONS[name];
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
}
