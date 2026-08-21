/**
 * The crown a legendary creature wears, at the right of its meta row.
 *
 * Legendary status has no other home on the block: D&D Beyond keeps it in a
 * checkbox, and a checkbox is not something a stat block has. A chip is — every
 * other value on the block wears one, and its ✕ already means "take this off
 * the creature". The only difference here is what comes off with it, which is
 * why this one asks first.
 */
import { useState } from "preact/hooks";
import type { Monster } from "../../statblock/model.js";
import { legendaryCasualties, removeLegendary } from "../../state/legendary.js";
import { useStore } from "../store-context.js";
import { Chip } from "../shared/Chip.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { Icon } from "../shared/Icon.js";

/** What the author is about to lose, named the way the block names it. */
function casualtyList({ resistance, actions }: { resistance: boolean; actions: boolean }): string {
  const losing: string[] = [];
  if (resistance) losing.push("the Legendary Resistance trait");
  if (actions) losing.push("the Legendary Actions section, along with everything in it");
  return `This also removes ${losing.join(" and ")}.`;
}

export function LegendaryChip({ monster }: { monster: Monster }) {
  const store = useStore();
  const [confirming, setConfirming] = useState(false);
  if (!monster.isLegendary) return null;

  const casualties = legendaryCasualties(monster);
  const hasContent = casualties.resistance || casualties.actions;
  const remove = () => {
    setConfirming(false);
    void removeLegendary(store);
  };

  return (
    <span class="legendary-chip">
      <Chip
        value="legendary"
        label={
          <>
            <Icon name="crown" size={14} /> Legendary
          </>
        }
        removeLabel="legendary"
        onRemove={() => (hasContent ? setConfirming(true) : remove())}
      />
      {confirming ? (
        <ConfirmDialog
          title="Remove legendary status?"
          confirmLabel="Remove"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        >
          {casualtyList(casualties)}
        </ConfirmDialog>
      ) : null}
    </span>
  );
}
