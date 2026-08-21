/**
 * One of the inlined Material glyphs.
 *
 * The `<svg>` itself — no wrapper. It used to be a span with the path appended
 * by a ref callback, which is what the hand-drawn renderers needed before Preact
 * owned the tree; now the class lands on the glyph and a changed `name` is one
 * patched attribute rather than a rebuilt element.
 */
import { DEFAULT_VIEWBOX, ICONS, type IconName } from "./icons.js";

export function Icon({
  name,
  size = 18,
  class: className,
}: {
  name: IconName;
  size?: number;
  class?: string;
}) {
  const { viewBox = DEFAULT_VIEWBOX, d } = ICONS[name];
  return (
    <svg
      class={className}
      viewBox={viewBox}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
