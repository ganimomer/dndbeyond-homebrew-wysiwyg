/**
 * Bidirectional codec between D&D Beyond's inline *macro* markup and the marker
 * spans the editor works with. This is the inverse-capable replacement for the
 * old one-way `normalizeDdbMarkup` (which discarded roll payloads and reference
 * slugs, making write-back impossible).
 *
 * DDB stores two macro shapes inside its `field-*-description-wysiwyg` HTML:
 *
 *   [rollable]display;{json}[/rollable]   a dice/DC roll; the JSON drives the
 *                                         clickable roll on DDB's own pages.
 *   [type]slug;display[/type]             a reference (condition, rules, spells,
 *                                         items…). `slug;` is optional; when
 *                                         present it is the link target.
 *
 * We turn those into spans that *carry the payload* on data-attributes, so a
 * later `editorHtmlToDdb` can rebuild the exact macro — the roll's JSON and the
 * reference's slug/type survive the round-trip untouched:
 *
 *   <span class="roll" data-roll="{json}">display</span>
 *   <span class="ref" data-ref="type" data-slug="slug">display</span>
 *
 * The transforms are pure string operations (no DOM), so they unit-test in Node
 * and stay identical whether run at read-time or when serializing editor HTML.
 *
 * Assumption: a rollable's JSON payload is flat (no nested `{}`), matching every
 * payload DDB emits. The non-greedy match is what lets several rollables share
 * one line; nested braces would need a real tokenizer.
 */
import type { RefToken } from "./types.js";

/** `[rollable]display;{json}[/rollable]` — group 1 = display, group 2 = `{json}`. */
const ROLLABLE = /\[rollable\]([\s\S]*?)(?:;(\{[\s\S]*?\}))?\[\/rollable\]/g;
/** `[type]inner[/type]` with a matching close tag — group 1 = type, 2 = inner. */
const REFERENCE = /\[([a-z][\w-]*)\]([\s\S]*?)\[\/\1\]/gi;
/** A leftover, unpaired macro tag (DDB renders these as nothing). */
const STRAY_TAG = / ?\[\/?[a-z][\w-]*\]/gi;

/** Our own marker spans, for the reverse direction. */
const ROLL_SPAN = /<span class="roll"(?: data-roll="([^"]*)")?>([\s\S]*?)<\/span>/g;
const REF_SPAN =
  /<span class="ref" data-ref="([^"]*)"(?: data-slug="([^"]*)")?>([\s\S]*?)<\/span>/g;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function unescapeAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/**
 * A reference macro's innards split into what it links to and what it shows.
 *
 * "slug;display" carries a link target; a bare "display" does not. The display
 * is always the last ";"-segment, so the slug is everything before it (which may
 * itself contain ";" — `[items]crossbow, heavy;Heavy Crossbow[/items]` does not,
 * but nothing stops one).
 */
function splitRef(inner: string): { slug?: string; display: string } {
  const cut = inner.lastIndexOf(";");
  if (cut < 0) return { display: inner };
  return { slug: inner.slice(0, cut), display: inner.slice(cut + 1) };
}

/**
 * DDB macro HTML → editor HTML. Rollables and references become marker spans
 * carrying their payload; any stray unpaired macro tag is dropped. All other
 * markup (paragraphs, emphasis, lists…) passes through unchanged.
 */
export function ddbToEditorHtml(html: string): string {
  return html
    .replace(ROLLABLE, (_all, display: string, json?: string) => {
      const attr = json ? ` data-roll="${escapeAttr(json)}"` : "";
      return `<span class="roll"${attr}>${display}</span>`;
    })
    .replace(REFERENCE, (_all, type: string, inner: string) => {
      const { slug, display } = splitRef(inner);
      const slugAttr = slug !== undefined ? ` data-slug="${escapeAttr(slug)}"` : "";
      return `<span class="ref" data-ref="${escapeAttr(type)}"${slugAttr}>${display}</span>`;
    })
    .replace(STRAY_TAG, "");
}

/**
 * Editor HTML → DDB macro HTML. The exact inverse of `ddbToEditorHtml` for the
 * marker spans; everything else is left as-is.
 */
export function editorHtmlToDdb(html: string): string {
  return html
    .replace(ROLL_SPAN, (_all, json: string | undefined, display: string) => {
      const payload = json ? `;${unescapeAttr(json)}` : "";
      return `[rollable]${display}${payload}[/rollable]`;
    })
    .replace(REF_SPAN, (_all, type: string, slug: string | undefined, display: string) => {
      const prefix = slug !== undefined ? `${unescapeAttr(slug)};` : "";
      return `[${type}]${prefix}${display}[/${type}]`;
    });
}

/**
 * The references a macro string carries, in the order it carries them.
 *
 * Reading rather than transforming, and here rather than anywhere else because
 * this is the module that knows what a macro looks like. Callers who want to
 * ask a question *about* a field's contents — does this Gear line carry a
 * shield? — would otherwise have to write the regex a second time, or build a
 * whole editor to hold the answer.
 *
 * Rollables are not references and are skipped: their payload is a die roll,
 * not a link.
 */
export function macroRefs(text: string): RefToken[] {
  const found: RefToken[] = [];
  // A fresh `RegExp` because `REFERENCE` is `/g` and shared: `matchAll` would
  // reject it outright, and `exec` would resume from wherever it was left.
  const pattern = new RegExp(REFERENCE.source, REFERENCE.flags);
  for (const [, type, inner] of text.matchAll(pattern)) {
    const { slug, display } = splitRef(inner ?? "");
    found.push({ ref: type ?? "", slug, text: display });
  }
  return found;
}
