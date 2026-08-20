/**
 * "Add section": the sections this creature hasn't got, one click from being on
 * the block with the caret already in them.
 *
 * The same bargain as the basics' "Add…" menu — revealing is a view decision,
 * nothing is written to D&D Beyond until something is typed — but a louder
 * affordance, because a whole section is a bigger thing to add than a Skills
 * row, and because it sits beside the block rather than at the foot of it.
 */
import type { Monster } from "../statblock/model.js";
import { revealSection } from "../state/session.js";
import { useSession, useStore } from "./store-context.js";
import { ContextMenu } from "./shared/ContextMenu.js";
import { hiddenSections, SECTION_LABEL } from "./prose/section-registry.js";

/** The `pendingFocus` key a section's editor watches for. */
export const sectionFocusKey = (section: string) => `section:${section}`;

export function AddSectionButton({ monster }: { monster: Monster }) {
  const store = useStore();
  const session = useSession();
  const hidden = hiddenSections(monster, session.revealedSections);
  if (!hidden.length) return null;

  return (
    <div class="sb-add-section">
      <ContextMenu
        items={hidden.map((section) => ({
          label: SECTION_LABEL[section],
          onClick: () =>
            store.update({
              revealedSections: revealSection(store.getSession(), section),
              pendingFocus: sectionFocusKey(section),
            }),
        }))}
        triggerText="Add section"
        triggerIcon="add"
        triggerLabel="Add a description section"
        triggerClass="add-section-trigger"
        menuClass="compact"
      />
    </div>
  );
}
