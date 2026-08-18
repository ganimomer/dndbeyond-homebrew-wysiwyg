/**
 * The seam between our stat-block model and D&D Beyond's actual page.
 *
 * Everything above this interface is browser- and page-agnostic. Everything
 * below it knows about DDB's DOM. Swapping content types (spells, items) later
 * means adding another adapter, not touching the editor or preview.
 */
import type { Ability, Monster, Ruleset, SectionKey } from "../statblock/model.js";

export type HomebrewKind = "monster" | "item" | "spell" | "unknown";

/** One option of a form `<select>`, for building an editable dropdown. */
export interface SelectOption {
  /** The form's option value (DDB uses numeric codes). */
  value: string;
  /** The human-readable label. */
  text: string;
  /** Whether this option is the currently selected one. */
  selected: boolean;
}

export interface PageAdapter {
  /** Which homebrew content type this adapter understands. */
  readonly kind: HomebrewKind;

  /** True when this adapter applies to the currently-loaded page. */
  matches(): boolean;

  /**
   * Reads DDB's form into our model. Returns null when the form isn't present
   * yet (DDB renders asynchronously), so callers can retry.
   */
  read(): Monster | null;

  /** Writes our model back into DDB's form fields. */
  write(monster: Monster): void;

  /** Sets the monster's stat-block ruleset in the form (the first wired edit). */
  setRuleset(ruleset: Ruleset): void;

  /** Writes a single ability score (1–30) back to the form. */
  setAbility(ability: Ability, score: number): void;

  /**
   * Writes an edited description section back to the form. `editorHtml` is the
   * editor's marker-span HTML; the adapter re-encodes it to DDB's inline macros.
   */
  setDescription(section: SectionKey, editorHtml: string): void;

  /** The creature-type options from the form's type `<select>`. */
  typeOptions(): SelectOption[];
  /** The full sub-type tag options (value + label + selected). */
  subTypeOptions(): SelectOption[];
  /** Writes the creature type (an option value) back to the form. */
  setType(value: string): void;
  /** Writes the full set of chosen subtype tags (option values) back to the form. */
  setSubTypes(values: string[]): void;

  /**
   * Watches DDB's own fields for user edits and invokes `onChange`. Returns an
   * unsubscribe function. Lets the preview stay in sync when the user types in
   * DDB's native inputs rather than ours.
   */
  observe(onChange: () => void): () => void;
}
