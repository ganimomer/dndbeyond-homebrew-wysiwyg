/**
 * The band between two entries.
 *
 * It exists because the space between entries is where two of an author's
 * questions live: are these two really one entry, and where does the one I'm
 * dragging go? The first is answered here by **Merge**; the second lights the
 * same band up as a drop target.
 *
 * Every insertion point in a section gets one — above the first entry and below
 * the last included — but only a band that actually *separates* two entries can
 * merge, so `onMerge` is what decides whether there is a button in it.
 */
import type { SectionKey } from "../../statblock/model.js";
import { Icon } from "../shared/Icon.js";
import { useDragActive, useDropTarget } from "./drag-context.js";

export function ItemGap({
  section,
  index,
  label,
  onMerge,
}: {
  section: SectionKey;
  /** Which insertion point this is: before entry `index`. */
  index: number;
  /** What one entry here is called, e.g. "trait". */
  label: string;
  /** Left off where there is nothing on both sides to join. */
  onMerge?: () => void;
}) {
  const isTarget = useDropTarget(section, index);
  // An offer to merge, under the pointer, while the author is carrying an entry
  // across the block would be an offer to click by accident.
  const dragging = useDragActive();

  return (
    <div class={isTarget ? "sb-item-gap is-drop-target" : "sb-item-gap"}>
      {onMerge && !dragging ? (
        <button
          type="button"
          class="sb-merge"
          aria-label={`Merge these two ${label}s`}
          onClick={onMerge}
        >
          <Icon name="cellMerge" size={14} />
          Merge
        </button>
      ) : null}
    </div>
  );
}
