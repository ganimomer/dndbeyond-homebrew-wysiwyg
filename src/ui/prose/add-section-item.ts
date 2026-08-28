/**
 * "Add section": the sections this creature hasn't got, one click from being on
 * the block with the caret already in them.
 *
 * A row in the name row's own menu, beside "Make legendary" and "Add lair" —
 * the other two ways a creature grows a part it didn't have. It lives there
 * rather than in a button beside the block because the name row is pinned:
 * whatever an author has scrolled down to, the menu is still at the top of the
 * window, which is the whole reason there is no button any more.
 *
 * The same bargain as the basics' "Add…" menu: revealing is a view decision,
 * and nothing is written to D&D Beyond until something is typed.
 */
import type { Monster } from "../../statblock/model.js";
import type { SessionState } from "../../state/session.js";
import type { EditorStore } from "../../state/store.js";
import { revealSection, sectionFocusKey } from "../../state/session.js";
import type { SubMenu } from "../shared/ContextMenu.js";
import { hiddenSections, SECTION_LABEL } from "./section-registry.js";

/** The menu row, or nothing at all when the block already has every section. */
export function addSectionEntry(
  monster: Monster,
  session: SessionState,
  store: EditorStore,
): SubMenu | null {
  const hidden = hiddenSections(monster, session.revealedSections);
  if (!hidden.length) return null;

  return {
    // The ellipsis is the promise of a menu rather than a deed, the same one
    // the basics' "Add…" makes. "Add lair" above it has none: it adds the thing
    // there and then.
    label: "Add section…",
    icon: "add",
    items: hidden.map((section) => ({
      label: SECTION_LABEL[section],
      onClick: () =>
        store.update({
          revealedSections: revealSection(store.getSession(), section),
          pendingFocus: sectionFocusKey(section),
        }),
    })),
  };
}
