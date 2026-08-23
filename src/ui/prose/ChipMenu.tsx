/**
 * The little menu that appears under a selected reference chip.
 *
 * Deliberately not `shared/ContextMenu.tsx`, whose rows this borrows: that one
 * owns a trigger button and its own open state, which is the whole of what it
 * is. This menu has no trigger — what opens it is a selection somewhere else —
 * and it hangs off an arbitrary box rather than off itself, so it needs the
 * measure-then-place dance `ReferenceMenu` does. Sharing the row markup and
 * nothing else is the honest split.
 *
 * Positioned inside the row rather than portalled, like every other floating
 * thing here: it lives in a shadow root, so there is no document body to escape
 * to and no positioning library to escape with.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MenuItem } from "../shared/ContextMenu.js";
import { Icon } from "../shared/Icon.js";
import { menuPlacement } from "./menu-placement.js";

export interface ChipMenuProps {
  /** The chip this belongs to, in viewport coordinates. */
  anchor: DOMRect;
  items: MenuItem[];
  onDismiss: () => void;
}

export function ChipMenu({ anchor, items, onDismiss }: ChipMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(null);

  // Measured, then placed — and `visibility: hidden` until it knows where it
  // goes, so it is never painted in the wrong spot. `ReferenceMenu`'s shape,
  // for `ReferenceMenu`'s reasons.
  useLayoutEffect(() => {
    const node = panel.current;
    const wrapper = node?.parentElement;
    if (!node || !wrapper) return;
    const { left, top } = menuPlacement(
      anchor,
      { width: node.offsetWidth, height: node.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    const box = wrapper.getBoundingClientRect();
    setOffset({ left: left - box.left, top: top - box.top });
  }, [anchor]);

  // Dismissed by a click anywhere but inside, and by Escape. `composedPath()`
  // because this is in a shadow root, where a listener on `window` would only
  // ever see the host; capture phase so a click on D&D Beyond's own page
  // underneath the overlay counts as outside too.
  useLayoutEffect(() => {
    const onClick = (event: Event) => {
      if (!event.composedPath().some((node) => node === panel.current)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onDismiss]);

  return (
    <div
      ref={panel}
      class="chip-menu"
      role="menu"
      style={{
        left: offset ? `${offset.left}px` : "0",
        top: offset ? `${offset.top}px` : "0",
        visibility: offset ? "visible" : "hidden",
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          class={item.danger ? "cm-item danger" : "cm-item"}
          // The chip's selection is the argument to every command here, and a
          // control that takes focus destroys it — the same bargain the format
          // toolbar's buttons make.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => item.onClick()}
        >
          {item.icon ? <Icon name={item.icon} class="cm-icon" /> : <span class="cm-icon" />}
          <span class="cm-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
