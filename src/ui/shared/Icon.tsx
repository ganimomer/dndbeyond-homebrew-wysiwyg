/**
 * One of the inlined Material glyphs, as a component.
 *
 * The paths are built as real SVG DOM (`makeIcon`) rather than written as JSX,
 * because the renderers that predate Preact need them too — so this is the
 * one-line ref dance that mounts one, in the one place that has to know it.
 */
import { makeIcon, type IconName } from "./icons.js";

export function Icon({ name, size, class: className }: { name: IconName; size?: number; class?: string }) {
  return (
    <span
      class={className}
      ref={(node) => {
        if (node && !node.firstChild) node.append(makeIcon(name, size));
      }}
    />
  );
}
