/**
 * Which description sections there are, what they're called, and which of them
 * an author can put on a block that hasn't got them.
 *
 * The same bargain as `fields/registry.ts`: one table drives both the layouts'
 * headings and the "Add section" menu, so the two can't drift. What it
 * deliberately doesn't own is *order* — the 2014 and 2024 blocks print their
 * sections differently, and that belongs to each layout.
 *
 * A section with no text isn't printed, exactly as a field with no value isn't.
 * Revealing one is a view decision (`session.revealedSections`) that puts an
 * empty editor on the block to type into.
 */
import type { Monster, SectionKey } from "../../statblock/model.js";
import { htmlHasContent } from "./sections.js";

/** What each section is called wherever it's named — heading or menu item. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  traits: "Traits",
  actions: "Actions",
  bonusActions: "Bonus Actions",
  reactions: "Reactions",
  // D&D Beyond calls the field "Characteristics"; the monster page prints it
  // "Description", and that is what an author reading the block sees.
  characteristics: "Description",
  legendary: "Legendary Actions",
  mythic: "Mythic Actions",
  lair: "Lair Actions",
};

/**
 * What an empty section says before anything is written in it. Each names the
 * kind of thing that belongs there rather than repeating the heading, since a
 * section only ever shows this while its heading is right above it.
 */
export const SECTION_PLACEHOLDER: Record<SectionKey, string> = {
  traits: "A feature the creature always has…",
  actions: "What it does on its turn…",
  bonusActions: "What it can do as a bonus action…",
  reactions: "What it does on someone else's turn…",
  characteristics: "What it looks like, where it's found, what it wants…",
  legendary: "What it does at the end of another creature's turn…",
  mythic: "What it does once its mythic trait triggers…",
  lair: "What its lair does on initiative count 20…",
};

/**
 * The sections that read as a list of named entries rather than as prose, and
 * are therefore edited an entry at a time (see `SectionList`).
 *
 * Everything but Description. A trait, an action or a reaction is a *thing the
 * creature has*, printed one per paragraph with its name in bold; Description is
 * where an author writes freely about what the creature looks like, and cutting
 * that into rows would be inventing a structure it hasn't got.
 */
export const LIST_SECTIONS: ReadonlySet<SectionKey> = new Set<SectionKey>([
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendary",
  "mythic",
  "lair",
]);

/**
 * What one entry in a list section is called, for the button that adds another.
 * Singular and lowercase: these are read inside a sentence ("Add bonus action"),
 * not as headings.
 */
export const SECTION_ITEM_LABEL: Record<SectionKey, string> = {
  traits: "trait",
  actions: "action",
  bonusActions: "bonus action",
  reactions: "reaction",
  characteristics: "paragraph",
  legendary: "legendary action",
  mythic: "mythic action",
  lair: "lair action",
};

/**
 * The sections the "Add section" menu offers, in the order it lists them.
 *
 * Legendary, mythic and lair are missing on purpose: D&D Beyond keeps each
 * behind a checkbox on the form (`field-is-legendary` and friends) and doesn't
 * read the textarea back while it's unticked, so adding one from here would
 * write prose nothing would ever load again. Tick the box in DDB's own form and
 * the section shows up on its own merit.
 */
export const ADDABLE_SECTIONS: readonly SectionKey[] = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "characteristics",
];

/** True when D&D Beyond holds prose for the section. */
export function hasSectionContent(monster: Monster, key: SectionKey): boolean {
  return htmlHasContent(monster.descriptionHtml?.[key]);
}

/** True when the section belongs on the block — it has text, or was asked for. */
export function isSectionVisible(
  monster: Monster,
  key: SectionKey,
  revealed: ReadonlySet<SectionKey> = new Set(),
): boolean {
  return hasSectionContent(monster, key) || revealed.has(key);
}

/** What the "Add section" menu offers: everything not currently on the block. */
export function hiddenSections(
  monster: Monster,
  revealed: ReadonlySet<SectionKey> | undefined,
): SectionKey[] {
  return ADDABLE_SECTIONS.filter((key) => !isSectionVisible(monster, key, revealed));
}
