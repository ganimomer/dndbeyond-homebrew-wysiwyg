/**
 * Builds the body of a description section, shared by both renderers. Prefers
 * the ready-made HTML read from D&D Beyond (`monster.descriptionHtml[key]`),
 * and otherwise renders the structured `NamedEntry[]` that samples use.
 */
import type { Monster, NamedEntry, SectionKey } from "../../statblock/model.js";
import { el } from "../shared/dom.js";
import { expandInline } from "./inline.js";
import { sanitizeHtml } from "./sanitize-html.js";

/**
 * Whether an HTML fragment carries anything worth showing. D&D Beyond leaves
 * unused sections as placeholder markup (`<p><br data-mce-bogus="1"></p>`),
 * which is a non-empty string but renders blank — so test the text/media it
 * actually produces, not the raw length. `<template>` content is inert (no
 * network or script), so this is safe to build off arbitrary input.
 */
export function htmlHasContent(html: string | undefined): boolean {
  if (!html || !html.trim()) return false;
  const t = document.createElement("template");
  t.innerHTML = html;
  const text = (t.content.textContent ?? "").replace(/ /g, " ").trim();
  return !!text || !!t.content.querySelector("img, image, svg, table");
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
  if (htmlHasContent(html)) {
    return sanitizeHtml(html!);
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
