/**
 * Cutting a description section into the entries it reads as.
 *
 * Traits, actions and the rest aren't prose — they're lists. D&D Beyond stores
 * them as one flat run of paragraphs, and the only thing marking where one entry
 * ends and the next begins is that an entry opens with its name in bold:
 *
 *   <p><em><strong>Misty Escape.</strong></em> If the vampire drops to 0…</p>
 *   <p>While it has 0 Hit Points in mist form, it can't return…</p>   ← same entry
 *   <p><em><strong>Spider Climb.</strong></em> The vampire can climb…</p>
 *
 * So that is the rule: a block starts a new item when it leads with bold, or
 * when it's the first one (which is how the unbolded Legendary Actions preamble
 * gets to be an entry of its own). Everything else joins the item above it.
 *
 * This is a *partition*, never a rewrite. `joinItems(splitItems(h))` gives back
 * `h`, and that matters more than the grouping does: the joined result is what
 * gets written back to D&D Beyond, so anything the split invented or lost would
 * be a creature quietly corrupted on the next autosave.
 *
 * Two liberties, both of which render as nothing: whitespace between blocks is
 * dropped (DDB newline-separates its paragraphs, Lexical butts them together),
 * and the parser fills in implied tags on the way through — a `<table>` written
 * without `<tbody>` comes back with one. Neither is new: every section that has
 * been edited once has already been through Lexical's exporter, which
 * normalizes considerably harder than this does.
 */

/** The tags that mark text as bold, and the ones bold hides behind. */
const BOLD_TAGS = new Set(["b", "strong"]);
/** Italic wrappers to see through: DDB writes <em><strong>, Lexical <i><b>. */
const ITALIC_TAGS = new Set(["em", "i"]);

/** The first child that isn't whitespace — what the reader's eye lands on. */
function firstMeaningfulChild(node: Element): ChildNode | null {
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && !(child.textContent ?? "").trim()) continue;
    return child;
  }
  return null;
}

/**
 * Whether a block opens in bold — the mark of a new entry.
 *
 * Descends only through italic wrappers, because that is the one thing bold is
 * ever nested inside here. Notably it does *not* descend into spans: a trait
 * that opens on a roll (`<span class="roll">+9</span> to hit`) is a
 * continuation of the entry above, and treating its span as transparent would
 * split the entry in two.
 */
function leadsWithBold(node: Node): boolean {
  let element = node.nodeType === 1 ? (node as Element) : null;
  while (element) {
    const tag = element.tagName.toLowerCase();
    if (BOLD_TAGS.has(tag)) return true;
    const first = firstMeaningfulChild(element);
    if (!first || first.nodeType !== 1) return false;
    const firstTag = (first as Element).tagName.toLowerCase();
    if (!BOLD_TAGS.has(firstTag) && !ITALIC_TAGS.has(firstTag)) return false;
    element = first as Element;
  }
  return false;
}

/** A node's contribution to the section's HTML, exactly as it came in. */
function outerHtml(node: ChildNode): string {
  if (node.nodeType === 1) return (node as Element).outerHTML;
  // A text node's own escaping is whatever the parse produced; re-serialize it
  // through a throwaway element rather than guessing at entities.
  const holder = document.createElement("div");
  holder.append(node.cloneNode(true));
  return holder.innerHTML;
}

/**
 * A section's HTML as the list of entries it reads as. `<template>` content is
 * inert — no network, no script — so this is safe to run over anything the form
 * hands us (the same trick `htmlHasContent` uses).
 */
export function splitItems(html: string): string[] {
  if (!html.trim()) return [];
  const template = document.createElement("template");
  template.innerHTML = html;

  const items: string[] = [];
  for (const node of template.content.childNodes) {
    // Whitespace between blocks is presentation in the source, not content.
    if (node.nodeType === 3 && !(node.textContent ?? "").trim()) continue;
    if (items.length === 0 || leadsWithBold(node)) items.push(outerHtml(node));
    else items[items.length - 1] += outerHtml(node);
  }
  return items;
}

/** The entries back as one section, ready for the adapter. */
export function joinItems(items: readonly string[]): string {
  return items.join("");
}

/**
 * The name an entry opens with — its bold lead-in, without the full stop.
 *
 * `""` when the entry doesn't open in bold, which by the rule above can only be
 * the first entry in a section: the unnamed Legendary Actions preamble. Callers
 * use this to recognise a particular entry ("is there already a Legendary
 * Resistance?") without having to parse the section themselves.
 */
export function entryName(itemHtml: string): string {
  const template = document.createElement("template");
  template.innerHTML = itemHtml;
  const first = Array.from(template.content.childNodes).find(
    (node) => node.nodeType !== 3 || (node.textContent ?? "").trim(),
  );
  if (!first || !leadsWithBold(first)) return "";
  // `leadsWithBold` has already proved the chain, so this descent terminates.
  let element = first as Element;
  while (!BOLD_TAGS.has(element.tagName.toLowerCase())) {
    element = firstMeaningfulChild(element) as Element;
  }
  return (element.textContent ?? "").trim().replace(/\.$/, "").trim();
}
