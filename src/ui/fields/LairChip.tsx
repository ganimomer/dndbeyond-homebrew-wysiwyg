/**
 * The castle a creature with a lair wears, beside the crown.
 *
 * Its removal reaches further than the crown's does, in one respect worth
 * spelling out to the author: a 2024 creature's Legendary Resistance carries
 * its in-lair uses inside the trait's own name, so losing the lair edits a
 * trait that isn't otherwise the lair's.
 */
import type { Monster } from "../../statblock/model.js";
import { lairCasualties, removeLair } from "../../state/lair.js";
import { useStore } from "../store-context.js";
import { StatusChip } from "./StatusChip.js";

export function LairChip({ monster }: { monster: Monster }) {
  const store = useStore();
  if (!monster.hasLair) return null;

  const { resistance, actions } = lairCasualties(monster);
  return (
    <StatusChip
      icon="castle"
      label="Lair"
      title="Remove lair?"
      casualties={[
        resistance && "the in-lair uses from Legendary Resistance",
        actions && "the Lair Actions section, along with everything in it",
      ]}
      onRemove={() => void removeLair(store)}
    />
  );
}
