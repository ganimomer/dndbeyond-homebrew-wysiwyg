/**
 * Writing an ability score back, and remembering that it moved.
 *
 * Both layouts need the same two things to happen, and the second is the
 * interesting one: the score is recorded as edited this session so everything
 * derived from it stays flagged for review until the author has looked.
 */
import type { Ability } from "../../statblock/model.js";
import { markChanged } from "../../state/session.js";
import { useEditing, useStore } from "../store-context.js";

export function useCommitAbility(): (ability: Ability, score: number) => void {
  const store = useStore();
  const editing = useEditing();
  return (ability, score) => {
    editing.setAbility(ability, score);
    store.update({ changedAbilities: markChanged(store.getSession(), ability) });
  };
}
