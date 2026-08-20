/**
 * Expands our lightweight inline markup into DOM, shared by both stat-block
 * renderers. Three constructs are supported:
 *
 *   {...}      a D&D Beyond roll/reference token (dice, DCs, links). Rendered
 *              as a subtle roll span; becomes a real clickable token later.
 *   **bold**   bold run (used for sub-labels like the vampire's weaknesses).
 *   *italic*   italic run (e.g. DDB's "Melee Attack Roll:" / "Hit:" labels).
 *   \n         a hard line break.
 *
 * `el` is injected so each renderer can tag the token span with its own class.
 */

type MakeEl = (
  tag: "span" | "strong" | "em" | "br",
  className?: string,
) => HTMLElement;

/** Matches a {roll token}, **bold run**, or *italic run* — first wins. */
const TOKEN = /\{([^}]+)\}|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function expandInline(
  text: string,
  el: MakeEl,
  tokenClass = "roll",
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = text.split("\n");

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) frag.append(el("br"));

    let last = 0;
    let m: RegExpExecArray | null;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line))) {
      if (m.index > last) {
        frag.append(document.createTextNode(line.slice(last, m.index)));
      }
      if (m[1] !== undefined) {
        const token = el("span", tokenClass);
        token.textContent = m[1];
        frag.append(token);
      } else if (m[2] !== undefined) {
        const strong = el("strong");
        strong.textContent = m[2];
        frag.append(strong);
      } else {
        const em = el("em");
        em.textContent = m[3];
        frag.append(em);
      }
      last = TOKEN.lastIndex;
    }
    if (last < line.length) {
      frag.append(document.createTextNode(line.slice(last)));
    }
  });

  return frag;
}
