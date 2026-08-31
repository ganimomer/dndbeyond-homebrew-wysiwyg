/**
 * The trash that takes one entry off a section — `RemoveSection`'s smaller
 * sibling, and the same bargain: an entry with nothing in it goes on one click,
 * one with prose asks first, because removing it takes the text off D&D Beyond's
 * server on the next save and undo isn't bound to a key yet.
 *
 * Never shown on a section's last remaining entry. Removing that isn't removing
 * an entry, it's removing the section — which is what the trash in the heading
 * beside it does.
 */
import { useLayoutEffect, useState } from "preact/hooks";
import { Icon } from "../shared/Icon.js";

export function RemoveItem({
  label,
  hasContent,
  onRemove,
}: {
  /** What one entry here is called, e.g. "trait". */
  label: string;
  hasContent: boolean;
  onRemove: () => void;
}) {
  const [armed, setArmed] = useState(false);

  // Disarms on Escape or a click anywhere else, the way `ContextMenu` closes.
  // `composedPath()` because this lives in a shadow root, where a listener on
  // `window` would only ever see the host; capture phase so a click on D&D
  // Beyond's own page under the overlay counts as outside too.
  useLayoutEffect(() => {
    if (!armed) return;
    const onClick = (event: Event) => {
      const inside = event
        .composedPath()
        .find((n) => (n as HTMLElement)?.classList?.contains?.("sb-remove-item"));
      if (!inside) setArmed(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArmed(false);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [armed]);

  if (armed) {
    return (
      <span class="sb-remove-item is-armed">
        <button
          type="button"
          class="sb-remove-confirm"
          aria-label={`Remove this ${label} and its text`}
          onClick={onRemove}
        >
          <Icon name="check" size={14} />
        </button>
        <button
          type="button"
          class="sb-remove-cancel"
          aria-label={`Keep this ${label}`}
          onClick={() => setArmed(false)}
        >
          <Icon name="close" size={14} />
        </button>
      </span>
    );
  }

  return (
    <span class="sb-remove-item">
      <button
        type="button"
        class="sb-remove-trigger"
        aria-label={`Remove this ${label}`}
        onClick={(event) => {
          // Without this the click reaches the outside-click listener the very
          // arm it just registered, and disarms again.
          event.stopPropagation();
          if (hasContent) setArmed(true);
          else onRemove();
        }}
      >
        <Icon name="delete" size={14} />
      </button>
    </span>
  );
}
