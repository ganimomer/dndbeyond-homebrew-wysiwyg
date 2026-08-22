/**
 * Turns a D&D Beyond description-section HTML string into a safe DocumentFragment.
 *
 * The bodies come from the user's own homebrew form, but we still render them
 * defensively: only an allowlist of formatting tags survives, every attribute
 * is dropped except sanitized `href`s, and disallowed elements are unwrapped
 * (their text/children kept). Fresh nodes are built rather than reused, so no
 * inline handlers or exotic attributes can slip through.
 */

/**
 * Elements whose *contents* go with them. Everything else that isn't allowed is
 * unwrapped, keeping its text — which is right for a stray `<div>` and wrong
 * for these, whose text is source code, not prose. (It was never executable,
 * since it's re-parsed as a text node; it just showed up as words.)
 */
const DROPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

const ALLOWED = new Set([
  "P", "BR", "EM", "STRONG", "B", "I", "U", "SPAN", "A",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
  "H4", "H5", "H6", "BLOCKQUOTE",
]);

export function sanitizeHtml(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  const out = document.createDocumentFragment();
  copyChildren(template.content, out);
  return out;
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
    if (!ALLOWED.has(element.tagName)) {
      // Unwrap: keep the (sanitized) children, discard the element itself.
      copyChildren(element, dest);
      return;
    }

    const clone = document.createElement(element.tagName.toLowerCase());
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (href && !/^\s*(javascript|data):/i.test(href)) {
        clone.setAttribute("href", href);
        clone.setAttribute("target", "_blank");
        clone.setAttribute("rel", "noreferrer");
      }
    } else if (element.tagName === "SPAN") {
      // Preserve only our own roll/reference markers — so they can be styled,
      // and so a reference can be *resolved*: the hover tooltip reads its type
      // and slug off these attributes, and stripping them here would leave the
      // read-only path with tokens that look interactive and aren't.
      //
      // The payloads are safe to keep because nothing interprets them as
      // markup: `ddb-references.ts` maps the type to a path literal of its own
      // and slugifies the slug before either reaches a URL. The shape checks
      // below are belt-and-braces — a sanitizer that copies an attribute
      // unexamined isn't one. An unrecognised span still comes through as a
      // bare span with its text — only the class and payload are dropped.
      const cls = element.getAttribute("class") ?? "";
      if (cls === "ref") {
        clone.setAttribute("class", cls);
        copyIfShaped(element, clone, "data-ref", /^[a-z][\w-]*$/i);
        copyIfShaped(element, clone, "data-slug", /^[^<>"]{1,120}$/);
      } else if (cls === "roll") {
        clone.setAttribute("class", cls);
        copyIfShaped(element, clone, "data-roll", /^[^<>]{1,400}$/);
      }
    }
    copyChildren(element, clone);
    dest.appendChild(clone);
  });
}

/** Copies one attribute across, but only if its value looks like what it should. */
function copyIfShaped(src: Element, dest: Element, name: string, shape: RegExp): void {
  const value = src.getAttribute(name);
  if (value !== null && shape.test(value)) dest.setAttribute(name, value);
}
