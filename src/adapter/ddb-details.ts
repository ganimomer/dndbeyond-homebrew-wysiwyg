/**
 * D&D Beyond's *rendered* stat block markup → the editor's own HTML.
 *
 * `ddb-markup.ts` is the codec for what the homebrew form stores: macro text,
 * which only the form has. A creature the author is comparing against is not
 * theirs to open a form for — all they can read is the public monster page, and
 * that page is the macros already rendered:
 *
 *   [rollable]+4;{"diceNotation":"1d20+4","rollType":"to hit",…}[/rollable]
 *     renders as  <span data-dicenotation="1d20+4" data-rolltype="to hit" …>+4</span>
 *
 *   [condition]Grappled[/condition]
 *     renders as  <a class="tooltip-hover condition-tooltip"
 *                    data-tooltip-href="/conditions/6-tooltip">grappled</a>
 *
 * Both are reversible, because the rendered form keeps everything the macro
 * carried: the roll's attributes are its JSON's keys one for one, and the
 * anchor's tooltip path is the reference kind's own `path`. So this reads a
 * page back into the marker spans the editor works with, and `editorHtmlToDdb`
 * takes it the rest of the way to a macro the form will store.
 *
 * What it does *not* do is trust the page. Everything outside the editor's
 * vocabulary is unwrapped to its text or dropped outright, the way
 * `ui/prose/sanitize-html.ts` treats a description it is only rendering — with
 * one difference. That sanitizer keeps links, because a rendered block may
 * legitimately contain one; here a link is either a reference (and becomes a
 * span) or it is DDB's own page furniture, and the editor has no node for it
 * either way.
 */
import { REFERENCE_KINDS } from "./reference-catalog.js";

/**
 * `/conditions/6-tooltip` → `conditions`; the id is the tooltip's, not ours.
 *
 * Matched anywhere in the value rather than anchored, because the attribute is
 * not left as the server wrote it: D&D Beyond's own script rewrites every
 * `data-tooltip-href` in place once the page runs, into a protocol-relative
 * absolute with a query on the end —
 * `//www.dndbeyond.com/conditions/6-tooltip?disable-webm=1`. The frame reads the
 * live DOM, so that is the shape this actually meets.
 */
const TOOLTIP_PATH = /\/([a-z0-9-]+)\/\d+-tooltip(?:[/?#]|$)/i;

/** DDB's `path` → the macro spelling its own forms store. */
const MACRO_BY_PATH = new Map(REFERENCE_KINDS.map((kind) => [kind.path as string, kind.macro]));

/**
 * The roll attributes DDB renders, and the JSON keys they came from. Ordered as
 * the form writes them, so a re-encoded payload reads like a hand-written one.
 */
const ROLL_KEYS: readonly (readonly [string, string])[] = [
  ["dicenotation", "diceNotation"],
  ["rolltype", "rollType"],
  ["rollaction", "rollAction"],
  ["rolldamagetype", "rollDamageType"],
];

/**
 * Elements whose *contents* go with them — their text is markup or script, not
 * prose. Same list, and the same reason, as the read-only sanitizer's.
 */
const DROPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "BUTTON", "SVG"]);

/** What the editor can hold. Anything else is unwrapped, keeping its text. */
const ALLOWED = new Set([
  "P", "BR", "EM", "STRONG", "B", "I", "U", "SPAN",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
  "H4", "H5", "H6", "BLOCKQUOTE",
]);

/**
 * One entry of a compared creature's prose, as the editor would have written it.
 *
 * Given a fragment of a monster page; gives back editor HTML — marker spans and
 * plain formatting, nothing else.
 */
export function detailsToEditorHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const out = document.createElement("div");
  copyChildren(template.content, out);
  return out.innerHTML;
}

function copyChildren(src: ParentNode, dest: Node): void {
  src.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.appendChild(document.createTextNode(node.nodeValue ?? ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return; // drop comments etc.

    const element = node as Element;
    if (DROPPED.has(element.tagName)) return;

    const marker = asRoll(element) ?? asReference(element);
    if (marker) {
      copyChildren(element, marker);
      dest.appendChild(marker);
      return;
    }
    if (!ALLOWED.has(element.tagName)) {
      // Unwrap: keep the children, discard the element itself. This is what
      // becomes of an anchor that wasn't a reference — DDB links a source book
      // and a habitat tag the same way it links a condition.
      copyChildren(element, dest);
      return;
    }
    const clone = document.createElement(element.tagName.toLowerCase());
    copyChildren(element, clone);
    dest.appendChild(clone);
  });
}

/**
 * A rendered rollable, as the span the editor holds it in.
 *
 * The page's attributes *are* the payload's keys, so the JSON is rebuilt rather
 * than recovered: a roll with no dice notation is not a roll, and one whose
 * damage type DDB didn't print didn't have one.
 */
function asRoll(element: Element): HTMLElement | null {
  if (element.tagName !== "SPAN") return null;
  if (!element.getAttribute("data-dicenotation")) return null;
  const payload: Record<string, string> = {};
  for (const [attribute, key] of ROLL_KEYS) {
    const value = element.getAttribute(`data-${attribute}`);
    if (value) payload[key] = value;
  }
  const span = document.createElement("span");
  span.setAttribute("class", "roll");
  span.setAttribute("data-roll", JSON.stringify(payload));
  return span;
}

/**
 * A rendered reference, as the span the editor holds it in.
 *
 * No `data-slug`: the macros a real homebrew form was captured containing name
 * the thing and let DDB resolve it (`[condition]Grappled[/condition]`), and the
 * tooltip's numeric id is not a slug. An anchor pointing at a compendium this
 * editor has no macro for is not a reference here, and is unwrapped instead.
 */
function asReference(element: Element): HTMLElement | null {
  if (element.tagName !== "A") return null;
  const path = TOOLTIP_PATH.exec(element.getAttribute("data-tooltip-href") ?? "")?.[1];
  const macro = path ? MACRO_BY_PATH.get(path.toLowerCase()) : undefined;
  if (!macro) return null;
  const span = document.createElement("span");
  span.setAttribute("class", "ref");
  span.setAttribute("data-ref", macro);
  return span;
}
