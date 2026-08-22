/**
 * Reading a `.ref` element back into the token it stands for.
 *
 * Shared by the hover controller and the preloader so that neither owns the
 * other, and so there is exactly one place that knows which three attributes
 * `RefNode.createDOM` and `sanitize-html.ts` agree to write.
 */
import type { RefToken } from "../adapter/types.js";

/** The `.ref` element an event landed on, if any. */
export function refUnder(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(".ref") : null;
}

/** A token as the DOM carries it. */
export function readToken(element: Element): RefToken {
  return {
    ref: element.getAttribute("data-ref") ?? "",
    slug: element.getAttribute("data-slug") ?? undefined,
    text: element.textContent ?? "",
  };
}
