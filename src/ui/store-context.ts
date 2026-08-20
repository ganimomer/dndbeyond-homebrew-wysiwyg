/**
 * The editor's store, reachable from anywhere in the tree.
 *
 * `App` is the only subscriber: it re-renders on a change and everything below
 * reads the fresh values through these hooks. That keeps the subscription in
 * one place — and it is what lets a field component be given nothing but the
 * creature and still reach the adapter it commits through.
 */
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Monster } from "../statblock/model.js";
import type { SessionState } from "../state/session.js";
import type { EditorStore } from "../state/store.js";
import type { EditingAdapter } from "../state/editing.js";

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("[microbrewery] rendered outside the editor's store");
  return store;
}

/** The creature as D&D Beyond's form currently has it. */
export function useMonster(): Monster {
  const monster = useStore().getMonster();
  if (!monster) throw new Error("[microbrewery] rendered before the form was read");
  return monster;
}

/** What the editor knows that the form doesn't. */
export function useSession(): SessionState {
  return useStore().getSession();
}

/** What edits go through: PageAdapter's shape, dispatched as commands. */
export function useEditing(): EditingAdapter {
  return useStore().editing;
}
