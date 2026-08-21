/**
 * What it means to make a creature legendary, and to stop.
 *
 * D&D Beyond keeps legendary status in a checkbox, and the checkbox is a gate:
 * `read()` reports no Legendary Actions text while it is unticked, and a save
 * with it unticked drops whatever the textarea holds. So ticking it isn't a
 * flag beside the section — it is what makes the section exist.
 *
 * Around that one write sit the two things an author would otherwise do by
 * hand, which is why this is a module rather than a line in a menu item: a
 * legendary creature wants a Legendary Resistance trait, and it wants somewhere
 * to type its legendary actions. Both gestures go through the command stack as
 * a single batch, so the whole change is one thing to undo.
 */
import type { Command } from "./command.js";
import type { Monster, Ruleset } from "../statblock/model.js";
import type { EditorStore } from "./store.js";
import * as edit from "./commands.js";
import { entryName, joinItems, splitItems } from "../ui/prose/section-items.js";
import { htmlHasContent } from "../ui/prose/sections.js";
import {
  entrySpotlightKey,
  revealSection,
  sectionFocusKey,
  unrevealSection,
} from "./session.js";

/**
 * What counts as the Legendary Resistance trait.
 *
 * Loose on purpose: authors write the count into the name ("Legendary
 * Resistance (3/Day)", "…(3/Day, or 4/Day in Lair)"), and a creature that has
 * any of those already has the trait. Adding a second one is the failure this
 * guards against.
 */
const LEGENDARY_RESISTANCE = /^legendary resistance\b/i;

/** The name an added trait is given. Three uses a day is the usual grant. */
const RESISTANCE_NAME = "Legendary Resistance (3/Day)";

/**
 * The trait's sentence, per ruleset.
 *
 * The two read the same today — the SRD wording didn't change between 2014 and
 * 2024, and the one difference the 2024 books do have ("3/Day, or 4/Day in
 * Lair") belongs to creatures with a lair rather than to the ruleset. The table
 * is here so a divergence has somewhere obvious to go, instead of arriving as a
 * conditional at the call site.
 */
const RESISTANCE_BODY: Record<Ruleset, (subject: string) => string> = {
  "5e": (subject) => `If ${subject} fails a saving throw, it can choose to succeed instead.`,
  "5.5e": (subject) => `If ${subject} fails a saving throw, it can choose to succeed instead.`,
};

/** Text destined for markup we're assembling by hand rather than parsing. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The Legendary Resistance trait, as one entry.
 *
 * `<em><strong>` because that is the shape the section is cut on and the shape
 * Lexical's bold-italic new entry exports — an entry we write has to be
 * indistinguishable from one the author typed.
 */
export function legendaryResistanceHtml(monster: Monster): string {
  const subject = monster.name.trim() ? `the ${monster.name.trim()}` : "the creature";
  const body = RESISTANCE_BODY[monster.ruleset](escapeHtml(subject));
  return `<p><em><strong>${RESISTANCE_NAME}.</strong></em> ${body}</p>`;
}

/** Where the creature's Legendary Resistance trait is, if it has one. */
export function findLegendaryResistance(monster: Monster): { index: number; name: string } | null {
  const items = splitItems(monster.descriptionHtml?.traits ?? "");
  for (const [index, item] of items.entries()) {
    const name = entryName(item);
    if (LEGENDARY_RESISTANCE.test(name)) return { index, name };
  }
  return null;
}

/** What taking legendary status off would take with it. */
export function legendaryCasualties(monster: Monster): { resistance: boolean; actions: boolean } {
  return {
    resistance: findLegendaryResistance(monster) !== null,
    // `htmlHasContent` is what makes "anything but spaces and line breaks" the
    // test: it already reads DDB's own empty-textarea placeholder as nothing.
    actions: htmlHasContent(monster.descriptionHtml?.legendary),
  };
}

/** Whether removing legendary status is worth asking about first. */
export function legendaryHasContent(monster: Monster): boolean {
  const { resistance, actions } = legendaryCasualties(monster);
  return resistance || actions;
}

/**
 * Makes the creature legendary: the tick, the trait, and a place to type.
 *
 * The session is updated first and synchronously. The menu item that calls this
 * has already closed its menu, and the section has to be on the block before
 * the render that follows, or there is nothing for the caret to land in.
 */
export function makeLegendary(store: EditorStore): Promise<void> {
  const monster = store.getMonster();
  if (!monster) return Promise.resolve();

  const commands: Command[] = [];
  const existing = findLegendaryResistance(monster);
  let name = existing?.name ?? RESISTANCE_NAME;
  if (!existing) {
    const trait = legendaryResistanceHtml(monster);
    name = entryName(trait);
    const items = splitItems(monster.descriptionHtml?.traits ?? "");
    commands.push(edit.setDescription(monster, "traits", joinItems([trait, ...items])));
  }
  commands.push(edit.setLegendary(monster, true));

  const session = store.getSession();
  store.update({
    revealedSections: revealSection(session, "legendary"),
    pendingFocus: sectionFocusKey("legendary"),
    // Whether we just wrote it or found it already there, this is the trait the
    // author needs to look at — the count is theirs to agree with.
    pendingSpotlight: entrySpotlightKey("traits", name),
  });

  return store.commands.transaction(commands, "Make legendary");
}

/**
 * Takes legendary status off, and everything that came with it.
 *
 * Only what is actually there is written: a creature with an empty Legendary
 * Actions section has no reason to send D&D Beyond an empty string for it.
 */
export function removeLegendary(store: EditorStore): Promise<void> {
  const monster = store.getMonster();
  if (!monster) return Promise.resolve();

  const commands: Command[] = [];
  const existing = findLegendaryResistance(monster);
  if (existing) {
    const items = splitItems(monster.descriptionHtml?.traits ?? "");
    items.splice(existing.index, 1);
    commands.push(edit.setDescription(monster, "traits", joinItems(items)));
  }
  if (htmlHasContent(monster.descriptionHtml?.legendary)) {
    commands.push(edit.setDescription(monster, "legendary", ""));
  }
  commands.push(edit.setLegendary(monster, false));

  store.update({ revealedSections: unrevealSection(store.getSession(), "legendary") });
  return store.commands.transaction(commands, "Not legendary");
}
