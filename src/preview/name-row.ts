/**
 * Builds the stat-block name row, shared by both renderers. The name itself is
 * a `contenteditable` div rather than an `<input>`: it's large display type that
 * wraps to a second line on a long name, which an input can't do — it would
 * scroll horizontally instead. The editor's `wireName` makes it live.
 *
 * The "Unnamed Creature" prompt is CSS on `.is-empty`, not text content, so an
 * unnamed creature doesn't hand the user a placeholder they have to delete
 * before typing.
 */
import type { Monster } from "../statblock/model.js";
import { el } from "./dom.js";

/** The focus key the panel restores the caret to (see `restoreFocus`). */
export const NAME_FOCUS_KEY = "name";

/**
 * True where `contenteditable="plaintext-only"` is honored. It keeps the node a
 * single run of text — no pasted markup, no rich-text keyboard shortcuts. Where
 * it isn't (older Firefox), plain `contenteditable` plus the paste handler and
 * the commit-time sanitizer in `wireName` get to the same place.
 */
const SUPPORTS_PLAINTEXT_ONLY = (() => {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("div");
  // Guard the probe itself: where contentEditable isn't implemented at all
  // (jsdom), assigning it just creates an expando that reads back as supported.
  if (!("contentEditable" in probe)) return false;
  try {
    probe.contentEditable = "plaintext-only";
  } catch {
    return false; // some engines throw on the unsupported value rather than ignoring it
  }
  return probe.contentEditable === "plaintext-only";
})();

export function nameRow(monster: Monster): HTMLElement {
  const row = el("div", "name-row");

  const name = el("div", "name");
  // Set the attribute, not the property: it's the form that survives environments
  // where contentEditable isn't implemented, and what the CSS selector matches.
  name.setAttribute("contenteditable", SUPPORTS_PLAINTEXT_ONLY ? "plaintext-only" : "true");
  name.dataset.focusKey = NAME_FOCUS_KEY;
  name.setAttribute("role", "textbox");
  name.setAttribute("aria-label", "Creature name");
  // Empty stays genuinely empty — the prompt is drawn by `.is-empty::before`.
  name.textContent = monster.name;
  if (!monster.name) name.classList.add("is-empty");

  row.append(name, el("div", "name-menu")); // menu filled by the editor overlay
  return row;
}
