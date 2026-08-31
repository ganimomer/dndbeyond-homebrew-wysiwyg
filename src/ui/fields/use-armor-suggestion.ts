/**
 * The armor class the Gear row is offering, and how the offer is answered.
 *
 * A hook rather than two more props threaded through both layouts: what the
 * armor-class field needs is one value out of the session and one write back
 * into it, and neither layout has any business knowing that is where it lives.
 * The same bargain `use-commit-ability.ts` makes.
 */
import type { ArmorSuggestion } from "../../state/session.js";
import { useSession, useStore } from "../store-context.js";

export interface ArmorOffer {
  suggestion: ArmorSuggestion | null;
  /** Taken or walked away from — either way it must not fire again. */
  done: () => void;
}

export function useArmorSuggestion(): ArmorOffer {
  const store = useStore();
  const session = useSession();
  return {
    suggestion: session.pendingArmor,
    done: () => store.update({ pendingArmor: null }),
  };
}
