/**
 * The trash that takes a description section back off the block — the "Add
 * section" button's opposite number, and what lets a section be added on a whim
 * without living with it.
 *
 * A section with nothing in it goes on one click: there is nothing to lose, and
 * asking would be ceremony. One with prose arms an inline confirm in the same
 * slot instead, because removing it clears D&D Beyond's field — the text is
 * gone from the server on the next save, and undo isn't bound to a key yet.
 */
import { useLayoutEffect, useState } from "preact/hooks";
import type { SectionKey } from "../../statblock/model.js";
import { unrevealSection } from "../../state/session.js";
import { useEditing, useMonster, useStore } from "../store-context.js";
import { Icon } from "../shared/Icon.js";
import { hasSectionContent, SECTION_LABEL } from "./section-registry.js";

export function RemoveSection({ section }: { section: SectionKey }) {
  const store = useStore();
  const editing = useEditing();
  const monster = useMonster();
  const [armed, setArmed] = useState(false);
  const label = SECTION_LABEL[section];
  const hasContent = hasSectionContent(monster, section);

  // Disarms on Escape or a click anywhere else, the way `ContextMenu` closes.
  // `composedPath()` because this lives in a shadow root, where a listener on
  // `window` would only ever see the host; capture phase so a click on D&D
  // Beyond's own page under the overlay counts as outside too.
  useLayoutEffect(() => {
    if (!armed) return;
    const onClick = (event: Event) => {
      const inside = event
        .composedPath()
        .find((n) => (n as HTMLElement)?.classList?.contains?.("sb-remove-section"));
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

  // Clearing the field is what makes the section stop rendering; dropping the
  // reveal is what stops an empty one being held open. Both, in that order, and
  // the section is back on the "Add section" menu.
  const remove = () => {
    if (hasContent) editing.setDescription(section, "");
    store.update({ revealedSections: unrevealSection(store.getSession(), section) });
  };

  if (armed) {
    return (
      <span class="sb-remove-section is-armed">
        <span class="sb-remove-prompt">Remove?</span>
        <button
          type="button"
          class="sb-remove-confirm"
          aria-label={`Remove ${label} and its text`}
          onClick={remove}
        >
          <Icon name="check" size={16} />
        </button>
        <button
          type="button"
          class="sb-remove-cancel"
          aria-label={`Keep ${label}`}
          onClick={() => setArmed(false)}
        >
          <Icon name="close" size={16} />
        </button>
      </span>
    );
  }

  return (
    <span class="sb-remove-section">
      <button
        type="button"
        class="sb-remove-trigger"
        aria-label={`Remove ${label}`}
        onClick={(event) => {
          // Without this the click reaches the outside-click listener the very
          // arm it just registered, and disarms again.
          event.stopPropagation();
          if (hasContent) setArmed(true);
          else remove();
        }}
      >
        <Icon name="delete" size={16} />
      </button>
    </span>
  );
}
