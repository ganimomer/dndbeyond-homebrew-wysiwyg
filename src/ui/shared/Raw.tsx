/**
 * Mounts a node that was built by hand rather than rendered.
 *
 * The remaining ones are the description bodies — sanitized D&D Beyond HTML,
 * or the structured entries the samples use — which arrive as fragments.
 * Rebuilt whenever the node changes, and never diffed into: the DOM inside is
 * not Preact's to reason about.
 */
import type { JSX } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

export function Raw({
  node,
  ...attrs
}: { node: Node | null } & JSX.HTMLAttributes<HTMLDivElement>) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const mount = host.current;
    if (!mount) return;
    if (node) mount.replaceChildren(node);
    else mount.replaceChildren();
  }, [node]);

  return <div ref={host} {...attrs} />;
}
