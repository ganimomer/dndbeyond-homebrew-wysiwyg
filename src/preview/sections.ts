/**
 * Builds the body of a description section, shared by both renderers. Prefers
 * the ready-made HTML read from D&D Beyond (`monster.descriptionHtml[key]`),
 * and otherwise renders the structured `NamedEntry[]` that samples use.
 */
import type { Monster, NamedEntry, SectionKey } from "../statblock/model.js";
import { el } from "./dom.js";
import { expandInline } from "./inline.js";
import { sanitizeHtml } from "./sanitize-html.js";

/** True when the section has any content to show (HTML or entries). */
export function hasSection(
  monster: Monster,
  key: SectionKey,
  entries?: NamedEntry[],
): boolean {
  const html = monster.descriptionHtml?.[key];
  if (html && html.trim()) return true;
  return !!entries && entries.length > 0;
}

/**
 * The section's body as a fragment, or null when empty. `intro` applies only to
 * the structured path (the DDB HTML already embeds its own preamble).
 */
export function sectionBody(
  monster: Monster,
  key: SectionKey,
  entries?: NamedEntry[],
  intro?: string,
): DocumentFragment | null {
  const html = monster.descriptionHtml?.[key];
  if (html && html.trim()) {
    return sanitizeHtml(html);
  }
  if (entries && entries.length > 0) {
    const frag = document.createDocumentFragment();
    if (intro) {
      const p = el("p", "intro");
      p.append(expandInline(intro, el, "roll"));
      frag.append(p);
    }
    for (const entry of entries) {
      const p = el("p", "entry");
      if (entry.name) {
        const label = el("span", "entry-label");
        label.textContent = `${entry.name}.`;
        p.append(label, " ");
      }
      p.append(expandInline(entry.text, el, "roll"));
      frag.append(p);
    }
    return frag;
  }
  return null;
}
