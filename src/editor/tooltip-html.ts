/**
 * D&D Beyond's tooltip HTML, made safe to drop into the page.
 *
 * Unlike `sanitize-html.ts`, this can't work from an allowlist: the whole point
 * of the popup is that DDB's own stylesheet recognises their markup, so the
 * structure and every class on it has to survive intact. What comes off instead
 * is anything active — scripts, frames, inline handlers, `javascript:` targets
 * — and `id`, which would otherwise collide with the page we're injecting into.
 *
 * The body is same-origin HTML from a signed-in session, so this is defence in
 * depth rather than a boundary we distrust. It costs one tree walk.
 */

/** Elements that execute, embed, or navigate. Dropped whole, children and all. */
const FORBIDDEN = new Set([
  "SCRIPT", "IFRAME", "FRAME", "OBJECT", "EMBED", "APPLET",
  "LINK", "META", "BASE", "STYLE",
  "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION",
]);

/** Attributes that can point somewhere, and so can point at a script. */
const URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction"];

export function tooltipFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  scrub(template.content);
  return template.content;
}

function scrub(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (FORBIDDEN.has(element.tagName)) {
      element.remove();
      continue;
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "id") {
        element.removeAttribute(attr.name);
      } else if (URL_ATTRS.includes(name) && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
  }
}
