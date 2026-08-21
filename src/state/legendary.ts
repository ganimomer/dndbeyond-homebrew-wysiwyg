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
 *
 * The trait itself lives in `legendary-resistance.ts`, because the lair amends
 * it too and neither feature is the other's business.
 */
import type { Command } from "./command.js";
import type { EditorStore } from "./store.js";
import * as edit from "./commands.js";
import { findLegendaryResistance, legendaryResistanceHtml } from "./legendary-resistance.js";
import type { Monster } from "../statblock/model.js";
import { entryName, joinItems, splitItems } from "../ui/prose/section-items.js";
import { htmlHasContent } from "../ui/prose/sections.js";
import {
  entrySpotlightKey,
  revealSection,
  sectionFocusKey,
  unrevealSection,
} from "./session.js";

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
  let name = existing?.name ?? "";
  if (!existing) {
    // A 2024 creature that already has a lair resists more often at home, so
    // the trait is born saying so — otherwise the result would depend on which
    // of the two chips the author reached for first.
    const inLair = monster.ruleset === "5.5e" && !!monster.hasLair;
    const trait = legendaryResistanceHtml(monster, { inLair });
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
