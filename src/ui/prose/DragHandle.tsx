/**
 * The handle that picks an entry up.
 *
 * It hangs in the stat block's own padding gutter rather than in the entry, so
 * an entry costs exactly the same height and width whether it is pointed at or
 * not — an affordance that pushed the creature's text around as the mouse
 * crossed it would be worse than no affordance.
 *
 * The pointer drag and the arrow keys are the same move: within the section,
 * or with Alt held, to the section above or below — which is how an action
 * becomes a bonus action.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import type { SectionKey } from "../../statblock/model.js";
import { Icon } from "../shared/Icon.js";
import { useIsDragging, useItemDrag } from "./drag-context.js";

export function DragHandle({
  section,
  id,
  label,
}: {
  section: SectionKey;
  id: number;
  /** What one entry here is called, e.g. "trait". */
  label: string;
}) {
  const drag = useItemDrag();
  const dragging = useIsDragging(section, id);
  const button = useRef<HTMLButtonElement>(null);

  // What dims while an entry is in hand is the entry, and CSS can't reach an
  // ancestor — `:has()` would, but this builds for a Firefox that hasn't got
  // it. One class, toggled where the fact is known.
  useLayoutEffect(() => {
    button.current?.closest(".sb-item")?.classList.toggle("is-dragging", dragging);
  }, [dragging]);

  return (
    <button
      type="button"
      class="sb-drag-handle"
      // How the list finds this handle again once its entry has moved.
      data-drag-handle={id}
      aria-label={`Move this ${label}`}
      ref={button}
      onPointerDown={(event) => drag.start(section, id, event)}
      onKeyDown={(event) => {
        const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (step === 0) return;
        // Otherwise the overlay scrolls out from under the entry being moved.
        event.preventDefault();
        drag.moveByKeyboard(section, id, step, event.altKey);
      }}
    >
      <Icon name="dragIndicator" size={14} />
    </button>
  );
}
