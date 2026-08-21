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
  | "castle";

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
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The same glyph as DOM, for code that paints outside the Preact tree — the save
 * indicator, which is repainted on its own schedule rather than by a render.
 * Everything else wants `<Icon>`.
 */
export function makeIcon(name: IconName, size = 18): SVGSVGElement {
  const { viewBox = DEFAULT_VIEWBOX, d } = ICONS[name];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
}
