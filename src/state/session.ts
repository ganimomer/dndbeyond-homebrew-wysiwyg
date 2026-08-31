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
import type { AvatarSize } from "../adapter/types.js";
import type { Ability, SectionKey } from "../statblock/model.js";
import type { OptionalField } from "../ui/fields/registry.js";

/** How an avatar upload is going, for as long as that's worth showing. */
export interface AvatarStatus {
  state: "saving" | "success" | "error";
  /** Object URL of the chosen file — the toast's thumbnail. */
  thumbUrl: string;
  /** What went wrong, when something did. */
  message?: string;
}

/**
 * An armor class the editor is offering, because the author changed the armor
 * the creature is wearing.
 *
 * Both halves together: the number and the words in the parentheses are one
 * fact about one piece of armor, and a block reading "16 (splint)" would be
 * saying something untrue about a creature in chain mail.
 */
export interface ArmorSuggestion {
  value: number;
  /** The armor-class row's qualifier — "splint", "half plate". */
  type: string;
}

export interface SessionState {
  /**
   * Optional fields the user added from the "Add…" menu that have nothing in
   * them yet. The stat block prints only the rows a creature actually has, so
   * these are the exception that keeps an empty row on screen to be filled in.
   * A field drops out the moment it has a value of its own.
   */
  readonly revealed: ReadonlySet<OptionalField>;
  /**
   * Description sections the user added that D&D Beyond has no text for, held
   * open with an empty editor to type into.
   *
   * Unlike `revealed` above, these are *not* pruned once the section has
   * content — and not dropped again when it's emptied. Prose commits on a
   * typing debounce rather than on blur, so a section that vanished the moment
   * it read empty would pull the editor out from under the caret of anyone who
   * deleted a word to retype it. A section leaves when the author removes it.
   */
  readonly revealedSections: ReadonlySet<SectionKey>;
  /** Abilities edited this session; drives the dependency highlights. */
  readonly changedAbilities: ReadonlySet<Ability>;
  /**
   * What the creature's armor is worth over its unarmored class. Read from the
   * pristine form and re-read whenever the user sets an armor class, so it
   * always holds the last figure they actually stood behind — which is what a
   * Dexterity change is measured against.
   */
  readonly armorBonus: number | null;
  /**
   * The armor class a gear change is offering, until the author has answered.
   *
   * A one-shot nudge like `pendingFocus` below, and cleared the same way — the
   * armor-class field opens itself when this arrives, and clears it whether the
   * offer is taken or walked away from.
   *
   * Deliberately not `armorBonus` above, which answers a different question and
   * on a different clock: that one is anchored once from the pristine form and
   * measures what a *Dexterity* edit did to armor whose kind never changed.
   */
  readonly pendingArmor: ArmorSuggestion | null;

  /**
   * A large avatar uploaded this session, as an object URL.
   *
   * The artwork shows it the moment the file is chosen, and goes on showing it
   * afterwards: D&D Beyond's own preview `<img>` is server-rendered and never
   * updates in place, so re-reading the form after a successful upload would put
   * the *old* picture back. This is the truthful one until the page reloads.
   */
  readonly avatarPreview: string | null;
  /** Each avatar's upload, while it's still saving or still being reported. */
  readonly avatarStatus: ReadonlyMap<AvatarSize, AvatarStatus>;

  /** Transitional: a `data-focus-key` to focus once, on the next render. */
  readonly pendingFocus: string | null;
  /**
   * An entry to draw the eye to once, on the next render — see
   * `entrySpotlightKey`.
   *
   * Same one-shot idea as `pendingFocus`, but it names the entry rather than
   * pointing at a position in the section. It has to: the write that puts the
   * entry there and the re-read that brings it back land in that order but not
   * in one paint, so an index recorded now could be pointing at the entry above
   * by the time anyone looks.
   */
  readonly pendingSpotlight: string | null;
}

export function emptySession(): SessionState {
  return {
    revealed: new Set(),
    revealedSections: new Set(),
    changedAbilities: new Set(),
    armorBonus: null,
    pendingArmor: null,
    avatarPreview: null,
    avatarStatus: new Map(),
    pendingFocus: null,
    pendingSpotlight: null,
  };
}

/** The `pendingFocus` key a section's editor watches for. */
export function sectionFocusKey(section: SectionKey): string {
  return `section:${section}`;
}

/** The `pendingSpotlight` key for one entry, by the name it opens with. */
export function entrySpotlightKey(section: SectionKey, name: string): string {
  return `${section}:${name}`;
}

/** `avatarStatus` with one avatar's upload set, or cleared when it's null. */
export function withAvatarStatus(
  state: SessionState,
  size: AvatarSize,
  status: AvatarStatus | null,
): ReadonlyMap<AvatarSize, AvatarStatus> {
  const next = new Map(state.avatarStatus);
  if (status) next.set(size, status);
  else next.delete(size);
  return next;
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

/** `revealedSections` with one more section held open. */
export function revealSection(state: SessionState, key: SectionKey): ReadonlySet<SectionKey> {
  return new Set(state.revealedSections).add(key);
}

/** `revealedSections` without a section — the author took it off the block. */
export function unrevealSection(state: SessionState, key: SectionKey): ReadonlySet<SectionKey> {
  const next = new Set(state.revealedSections);
  next.delete(key);
  return next;
}

/** `changedAbilities` with one more on it. */
export function markChanged(state: SessionState, ability: Ability): ReadonlySet<Ability> {
  return new Set(state.changedAbilities).add(ability);
}
