/**
 * The seam between our stat-block model and D&D Beyond's actual page.
 *
 * Everything above this interface is browser- and page-agnostic. Everything
 * below it knows about DDB's DOM. Swapping content types (spells, items) later
 * means adding another adapter, not touching the editor or preview.
 */
import type {
  Ability,
  ArmorClass,
  HitPoints,
  Monster,
  Ruleset,
  SectionKey,
} from "../statblock/model.js";
import type { Priority } from "./task-queue.js";

export type HomebrewKind = "monster" | "item" | "spell" | "unknown";

/**
 * Which of the two avatars an upload is for: the small one on the listing page,
 * or the large one on the monster's own page (and so in the stat block).
 */
export type AvatarSize = "small" | "large";

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

  /**
   * Persists the page's current state, without navigating away. Rejects when
   * the save didn't go through, so the caller can retry and surface it.
   */
  save(): Promise<void>;

  /** Sets the monster's stat-block ruleset in the form (the first wired edit). */
  setRuleset(ruleset: Ruleset): void;

  /** Writes a single ability score (1–30) back to the form. */
  setAbility(ability: Ability, score: number): void;

  /**
   * Writes the armor-class number and its qualifier. A plain form field like the
   * ability scores, so autosave persists it.
   */
  setArmorClass(armorClass: ArmorClass): void;

  /** The Hit Die options ("d4".."d20") from the form's hit-points select. */
  hitDieOptions(): SelectOption[];
  /**
   * Writes all four hit-point controls. Like the ability scores these are plain
   * form fields, so this is synchronous and autosave persists it.
   */
  setHitPoints(hitPoints: HitPoints): void;

  /**
   * Writes an edited description section back to the form. `editorHtml` is the
   * editor's marker-span HTML; the adapter re-encodes it to DDB's inline macros.
   */
  setDescription(section: SectionKey, editorHtml: string): void;

  /**
   * Ticks or unticks D&D Beyond's "Is Legendary?" checkbox.
   *
   * This is the gate the Legendary Actions section lives behind: `read()`
   * reports no `legendary` text while it is off, and a save with it off drops
   * whatever the textarea holds. So it is what makes the section exist at all,
   * not merely a flag beside it.
   */
  setLegendary(on: boolean): void;

  /**
   * Ticks or unticks D&D Beyond's "Has Lair?" checkbox.
   *
   * The same gate as `setLegendary`, over the Lair Actions textarea. DDB spells
   * this field `has-lair` rather than `is-lair`, and names its description
   * wrapper `lair-description` rather than `lair-actions-description` — the
   * adapter absorbs both inconsistencies so nothing above it has to know.
   */
  setHasLair(on: boolean): void;

  /**
   * Every skill the page offers, with `selected` marking the ones the creature
   * already has. Unlike the other option lists this one isn't read off a
   * `<select>` — see the adapter.
   */
  skillOptions(): SelectOption[];
  /**
   * Adds a skill with the given final bonus. Async because skills aren't form
   * fields: they're separate records with their own endpoint, so this persists
   * on its own rather than waiting for autosave.
   */
  addSkill(value: string, bonus: number): Promise<void>;
  /** Removes the named skill. Persists immediately, like `addSkill`. */
  removeSkill(name: string): Promise<void>;

  /** Every movement type, with `selected` marking those the creature has. */
  movementOptions(): SelectOption[];
  /** Adds a movement type at `speed` feet. Async for the same reason as skills. */
  addMovement(value: string, speed: number): Promise<void>;
  /** Changes an existing movement's distance, preserving its note. */
  setMovementSpeed(type: string, speed: number): Promise<void>;
  /** Removes a movement type. */
  removeMovement(type: string): Promise<void>;

  /** The six abilities as options, with the proficient saves marked selected. */
  savingThrowOptions(): SelectOption[];
  /**
   * Writes the full set of proficient saves (option values). Unlike skills these
   * are an ordinary form field, so this is synchronous and autosave persists it.
   */
  setSavingThrows(values: string[]): void;

  /**
   * Every damage adjustment DDB offers, as "Acid - Resistance" option text with
   * `selected` marking the creature's. All three adjustments (vulnerability,
   * resistance, immunity) come from this one multi-select.
   */
  damageAdjustmentOptions(): SelectOption[];
  /**
   * Writes the full set of chosen damage adjustments (option values) across all
   * three kinds. An ordinary form field, so autosave persists it.
   */
  setDamageAdjustments(values: string[]): void;

  /** Every condition DDB offers, with the creature's immunities marked. */
  conditionImmunityOptions(): SelectOption[];
  /** Writes the full set of condition immunities. Rides autosave. */
  setConditionImmunities(values: string[]): void;

  /** Every sense type, with `selected` marking those the creature has. */
  senseOptions(): SelectOption[];
  /**
   * Adds a sense with its free-text range. Async for the same reason as skills
   * and movements: senses are separate records, not form fields.
   */
  addSense(value: string, note: string): Promise<void>;
  /** Changes an existing sense's range note. */
  setSenseNote(type: string, note: string): Promise<void>;
  /** Removes a sense. */
  removeSense(type: string): Promise<void>;

  /** Writes the passive Perception that closes the Senses row. Rides autosave. */
  setPassivePerception(value: number): void;

  /** Writes the 5.5e Gear note (a plain form field). */
  setGear(text: string): void;
  /** Writes the free-text languages note (a plain form field). */
  setLanguages(text: string): void;

  /** Writes the creature name back to the form. */
  setName(name: string): void;

  /**
   * Opens the browser's file picker for one of the page's avatar inputs, and
   * answers whether there was one to open.
   *
   * Must be called synchronously from a user gesture — it clicks the page's own
   * `<input type=file>`, and a browser only opens a picker for a trusted click.
   * The file the author chooses stays in that input, which is what `save()`
   * serializes, so an upload needs no request of its own.
   */
  chooseAvatar(size: AvatarSize): boolean;
  /**
   * Why the page would refuse this file, phrased for the author — or null when
   * it wouldn't. Checked here rather than left to the server because an invalid
   * upload comes back as a *successful* response with errors rendered into a
   * page we discard, which would read as a save that worked.
   */
  avatarProblem(size: AvatarSize, file: File): string | null;
  /** Notifies when a file is chosen for either avatar. Returns unsubscribe. */
  onAvatarChosen(handler: (size: AvatarSize, file: File) => void): () => void;
  /**
   * Empties an avatar input once its file is saved, so that every later save
   * doesn't post the image again.
   */
  clearAvatar(size: AvatarSize): void;

  /** The size options from the form's size `<select>`. */
  sizeOptions(): SelectOption[];
  /** The creature-type options from the form's type `<select>`. */
  typeOptions(): SelectOption[];
  /** The full sub-type tag options (value + label + selected). */
  subTypeOptions(): SelectOption[];
  /** The alignment options from the form's alignment `<select>`. */
  alignmentOptions(): SelectOption[];
  /** Writes the size (an option value) back to the form. */
  setSize(value: string): void;
  /** Writes the creature type (an option value) back to the form. */
  setType(value: string): void;
  /** Writes the full set of chosen subtype tags (option values) back to the form. */
  setSubTypes(values: string[]): void;
  /** Writes the alignment (an option value) back to the form. */
  setAlignment(value: string): void;

  /**
   * Watches DDB's own fields for user edits and invokes `onChange`. Returns an
   * unsubscribe function. Lets the preview stay in sync when the user types in
   * DDB's native inputs rather than ours.
   */
  observe(onChange: () => void): () => void;
}

/**
 * A `.ref` token exactly as the rendered DOM carries it — the macro type, the
 * link target when the macro named one, and the words the author actually
 * wrote. `RefNode.createDOM` and `sanitize-html.ts` are the two places these
 * attributes are put on an element; both render the same three.
 */
export interface RefToken {
  /** `data-ref` — DDB's macro name: "condition", "spells", "rules"… */
  ref: string;
  /** `data-slug` — present only when the macro carried a link target. */
  slug?: string;
  /** The displayed text, which is the lookup key when there is no slug. */
  text: string;
}

/** What D&D Beyond says a reference means. */
export interface ReferenceTooltip {
  /** DDB's own tooltip HTML, ready to drop into the popup body. */
  html: string;
  /** DDB's `Type` field: "condition", "spell"… or "blocked" behind a paywall. */
  type: string;
  /** The canonical page for the reference, when the response names one. */
  url?: string;
}

/**
 * Where a reference token's definition comes from.
 *
 * Deliberately its own interface rather than methods on `PageAdapter`: a
 * definition needs no monster and no form — it is knowledge about the D&D
 * Beyond *site*, not about the document being edited — and every content type
 * we ever adapt wants the identical lookup.
 */
export interface LookupOptions {
  /**
   * "background" is a preload nobody is waiting on: it yields its slot to a
   * hover and asks the browser to deprioritise the request. Defaults to
   * "interactive", because an omitted option must never be the slow one.
   */
  priority?: Priority;
}

export interface ReferenceSource {
  /**
   * The token's definition, or null when there isn't one to be had. Never
   * rejects: a tooltip is an ornament, and a rejected promise inside a hover
   * handler is a bug report waiting to happen.
   */
  lookup(token: RefToken, options?: LookupOptions): Promise<ReferenceTooltip | null>;
}
