/**
 * Material UI icon paths, inlined so nothing is fetched at runtime.
 *
 * These live in `preview/` rather than beside the context menu because the
 * renderers need them too (the 5.5e Save column's proficiency circles), and
 * `preview/` can't import from `editor/` without inverting the layering.
 */
export type IconName =
  | "loop"
  | "close"
  | "check"
  | "settings"
  | "syncProblem"
  | "circle"
  | "radioButtonUnchecked";

/** Material UI icon name → its 24×24 path data. */
const ICON_PATHS: Record<IconName, string> = {
  loop: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  // check — accepts an inline edit, opposite the ✕ that abandons it.
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  // settings — the gear that opens the hit-points editor.
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  // sync_problem — a failed save, offering a retry.
  syncProblem: "M3 12c0-2.21.91-4.2 2.36-5.64L3 4h7v7L7.41 8.41C6.28 9.55 5.5 11.18 5.5 12c0 2.5 1.5 4.7 3.7 5.7l-.8 1.8C5.6 18.2 3 15.4 3 12zm18 0c0 3.4-2.6 6.2-5.4 7.5l-.8-1.8c2.2-1 3.7-3.2 3.7-5.7 0-.82-.78-2.45-1.91-3.59L14 11V4h7l-2.36 2.36C20.09 7.8 21 9.79 21 12zM11 15h2v2h-2v-2zm0-8h2v6h-2V7z",
  // A proficient saving throw, filled like a character sheet's proficiency dot.
  circle: "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2z",
  // radio_button_unchecked — the same dot, not proficient.
  radioButtonUnchecked:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
};

const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds a Material icon that inherits its colour from `currentColor`. */
export function makeIcon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}
