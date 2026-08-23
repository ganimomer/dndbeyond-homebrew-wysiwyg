/**
 * The macro codec for D&D Beyond's *plain* fields.
 *
 * `ddb-markup.ts` handles the WYSIWYG boxes, whose stored value is HTML with
 * macros in it. Gear and the Languages note are neither: they are ordinary
 * `<input>`s, so their value is **text** that happens to carry the same macros —
 *
 *   [items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items]
 *
 * — and D&D Beyond renders each of those as a link on the creature's page. The
 * preview reads them the same way, which means the same round trip the
 * description sections make, with an escape on the way in and a flatten on the
 * way out. Everything in between is `ddb-markup.ts`'s: one place still knows
 * what a macro looks like.
 *
 * The flatten is why this module isn't in there. Getting from the editor's HTML
 * back to a single line of text means parsing it, and `ddb-markup.ts` promises
 * to be pure string work. What is parsed here is always our own exporter's
 * output, and it is parsed into an inert `<template>` — no network, no script.
 */
import { ddbToEditorHtml, editorHtmlToDdb } from "./ddb-markup.js";

/** The three characters that would otherwise be read as markup, not as text. */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A plain field's value → editor HTML: one paragraph, macros decoded to marker
 * spans. An empty value stays empty, so the editor opens on its placeholder
 * rather than on a paragraph the author didn't write.
 */
export function ddbTextToEditorHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `<p>${ddbToEditorHtml(escapeText(trimmed))}</p>`;
}

/**
 * Editor HTML → a plain field's value: macros re-encoded, then everything that
 * isn't text thrown away.
 *
 * A one-line field can't keep paragraphs, line breaks or bold, and the author
 * can still produce all three by pasting. So rather than refuse the paste, this
 * takes what the field can hold: the words, in order, on one line. Blocks and
 * breaks become the single space that keeps the words either side of them
 * apart.
 */
export function editorHtmlToDdbText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = editorHtmlToDdb(html).replace(/<br\s*\/?>/gi, " ");
  const blocks = [...template.content.children];
  const lines = blocks.length
    ? blocks.map((block) => block.textContent ?? "")
    : [template.content.textContent ?? ""];
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join(" ");
}
