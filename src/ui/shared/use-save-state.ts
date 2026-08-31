/**
 * The autosave's state, as something a component re-renders on.
 *
 * Saves land on their own schedule rather than the render loop's — a request
 * starting or finishing doesn't touch the form, so nothing in the store
 * changes and nothing repaints. That's deliberate: the save indicators are
 * painted straight into their slots (see App.tsx). But a control whose
 * *availability* depends on whether the form is clean has to actually
 * re-render when a save lands, or it stays greyed out with the menu open.
 */
import { useLayoutEffect, useState } from "preact/hooks";
import type { SaveState } from "../../editor/autosave.js";
import { useStore } from "../store-context.js";

export function useSaveState(): SaveState {
  const store = useStore();
  const [state, setState] = useState<SaveState>(store.autosave.state);
  useLayoutEffect(() => store.autosave.onStateChange(setState), [store]);
  return state;
}
