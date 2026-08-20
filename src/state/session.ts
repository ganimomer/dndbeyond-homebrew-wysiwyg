/**
 * What the editor knows that D&D Beyond doesn't.
 *
 * None of this is ever written to the form or posted anywhere: it is the state
 * of an editing session — which optional rows the user has asked for, which
 * abilities they have touched, which mini-form is open and what is half-typed
 * in it. It exists because the stat block is a *document*, and a document
 * editor has to remember things the document itself has no place to record.
 *
 * One field here is transitional. `pendingFocus` props up a render loop that
 * throws the DOM away each time; a field that Preact diffs in place keeps its
 * own caret, so it stops meaning anything once the last hand-drawn field goes.
 */
import type { Ability } from "../statblock/model.js";
import type { OptionalField } from "../ui/fields/registry.js";

export interface SessionState {
  /**
   * Optional fields the user added from the "Add…" menu that have nothing in
   * them yet. The stat block prints only the rows a creature actually has, so
   * these are the exception that keeps an empty row on screen to be filled in.
   * A field drops out the moment it has a value of its own.
   */
  readonly revealed: ReadonlySet<OptionalField>;
  /** Abilities edited this session; drives the dependency highlights. */
  readonly changedAbilities: ReadonlySet<Ability>;
  /**
   * What the creature's armor is worth over its unarmored class. Read from the
   * pristine form and re-read whenever the user sets an armor class, so it
   * always holds the last figure they actually stood behind — which is what a
   * Dexterity change is measured against.
   */
  readonly armorBonus: number | null;

  /** Transitional: a `data-focus-key` to focus once, on the next render. */
  readonly pendingFocus: string | null;
}

export function emptySession(): SessionState {
  return {
    revealed: new Set(),
    changedAbilities: new Set(),
    armorBonus: null,
    pendingFocus: null,
  };
}

/** `revealed` with one more field on it. */
export function reveal(state: SessionState, field: OptionalField): ReadonlySet<OptionalField> {
  return new Set(state.revealed).add(field);
}

/** `revealed` without a field — it has a value now, or was thought better of. */
export function unreveal(state: SessionState, field: OptionalField): ReadonlySet<OptionalField> {
  const next = new Set(state.revealed);
  next.delete(field);
  return next;
}

/** `changedAbilities` with one more on it. */
export function markChanged(state: SessionState, ability: Ability): ReadonlySet<Ability> {
  return new Set(state.changedAbilities).add(ability);
}
