/**
 * Turns a D&D Beyond description-section HTML string into a safe DocumentFragment.
 *
 * The bodies come from the user's own homebrew form, but we still render them
 * defensively: only an allowlist of formatting tags survives, every attribute
 * is dropped except sanitized `href`s, and disallowed elements are unwrapped
 * (their text/children kept). Fresh nodes are built rather than reused, so no
 * inline handlers or exotic attributes can slip through.
 */

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
      // Preserve only our own roll/reference markers so they can be styled.
      const cls = element.getAttribute("class") ?? "";
      if (cls === "roll" || cls === "ref") clone.setAttribute("class", cls);
    }
    copyChildren(element, clone);
    dest.appendChild(clone);
  });
}
