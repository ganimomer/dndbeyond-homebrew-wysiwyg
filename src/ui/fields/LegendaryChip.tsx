/**
 * The crown a legendary creature wears, at the right of its meta row.
 *
 * Everything about how a status chip behaves is in `StatusChip`; what's here is
 * the wording, because only this side knows that taking the crown off reaches
 * into two sections the author isn't looking at.
 */
import type { Monster } from "../../statblock/model.js";
import { legendaryCasualties, removeLegendary } from "../../state/legendary.js";
import { useStore } from "../store-context.js";
import { StatusChip } from "./StatusChip.js";

export function LegendaryChip({ monster }: { monster: Monster }) {
  const store = useStore();
  if (!monster.isLegendary) return null;

  const { resistance, actions } = legendaryCasualties(monster);
  return (
    <StatusChip
      icon="crown"
      label="Legendary"
      title="Remove legendary status?"
      casualties={[
        resistance && "the Legendary Resistance trait",
        actions && "the Legendary Actions section, along with everything in it",
      ]}
      onRemove={() => void removeLegendary(store)}
    />
  );
}
