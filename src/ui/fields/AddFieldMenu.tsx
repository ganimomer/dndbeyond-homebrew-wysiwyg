/**
 * The "Add…" menu at the foot of the basics section: every field the creature
 * hasn't got, one click from being on the block.
 *
 * Revealing is *only* a view decision — nothing is written to D&D Beyond, and
 * the store forgets it as soon as the field has a real value to render from.
 * Which is also what makes a field go away again when its last value is
 * removed. Rendered only when something is actually missing.
 */
import type { Monster } from "../../statblock/model.js";
import { reveal } from "../../state/session.js";
import { useSession, useStore } from "../store-context.js";
import { ContextMenu } from "../shared/ContextMenu.js";
import { hiddenFields } from "./registry.js";

export function AddFieldMenu({ monster }: { monster: Monster }) {
  const store = useStore();
  const session = useSession();
  const hidden = hiddenFields(monster, session.revealed, monster.ruleset);
  if (!hidden.length) return null;

  return (
    <div class="add-field">
      <ContextMenu
        items={hidden.map((spec) => ({
          label: spec.menuLabel,
          onClick: () =>
            // Adding a row is always a prelude to filling it in, so the control
            // it names is the one the caret should land in.
            store.update({
              revealed: reveal(store.getSession(), spec.key),
              pendingFocus: spec.focusKey,
            }),
        }))}
        triggerText="Add…"
        triggerIcon="add"
        triggerLabel="Add a field"
        triggerClass="sb-add"
        menuClass="compact"
      />
    </div>
  );
}
