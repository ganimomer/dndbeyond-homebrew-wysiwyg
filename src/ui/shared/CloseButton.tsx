/**
 * Closes the overlay. A standalone icon button rather than an item in the
 * context menu beside it, pinned to the far right of the name row — leaving is
 * the one action that shouldn't take two clicks to find.
 */
import { makeIcon } from "../shared/icons.js";

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      class="name-close"
      aria-label="Close"
      onClick={onClick}
      ref={(node) => {
        if (node && !node.firstChild) node.append(makeIcon("close"));
      }}
    />
  );
}
