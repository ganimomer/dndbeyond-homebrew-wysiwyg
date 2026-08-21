/**
 * What it means to give a creature a lair, and to take it away.
 *
 * The same gate as the crown, one checkbox over: D&D Beyond reports no Lair
 * Actions text while `has-lair` is unticked and drops the textarea's contents
 * on save, so ticking the box is what makes the section exist at all.
 *
 * The one thing a lair has that legendary status doesn't is a reach into prose
 * that isn't its own. A 2024 creature resists more often at home, and the books
 * write that into the Legendary Resistance parenthetical rather than into a
 * trait of the lair's — so adding a lair amends the trait, and removing one
 * puts it back. Everything about *how* that amendment reads lives in
 * `legendary-resistance.ts`; this module only decides when to ask for it.
 */
import type { Command } from "./command.js";
import type { EditorStore } from "./store.js";
import type { Monster } from "../statblock/model.js";
import * as edit from "./commands.js";
import {
  findLegendaryResistance,
  withLairUses,
  withoutLairUses,
} from "./legendary-resistance.js";
import { joinItems, rewriteEntryName, splitItems } from "../ui/prose/section-items.js";
import { htmlHasContent } from "../ui/prose/sections.js";
import {
  entrySpotlightKey,
  revealSection,
  sectionFocusKey,
  unrevealSection,
} from "./session.js";

/**
 * Whether this creature's Legendary Resistance is the lair's business.
 *
 * Only in 2024 — the 2014 books grant no extra use — and only when there is a
 * trait to amend.
 */
function resistance(monster: Monster): { index: number; name: string } | null {
  if (monster.ruleset !== "5.5e") return null;
  return findLegendaryResistance(monster);
}

/** The traits section with the resistance trait renamed, or null to leave it. */
function amendTraits(
  monster: Monster,
  at: { index: number; name: string },
  rename: (name: string) => string | null,
): string | null {
  const next = rename(at.name);
  if (next === null) return null;
  const items = splitItems(monster.descriptionHtml?.traits ?? "");
  const item = items[at.index];
  if (item === undefined) return null;
  items[at.index] = rewriteEntryName(item, () => next);
  return joinItems(items);
}

/** What taking the lair away would take with it. */
export function lairCasualties(monster: Monster): { resistance: boolean; actions: boolean } {
  const at = resistance(monster);
  return {
    // Only a clause that is actually there is a thing to lose.
    resistance: at !== null && withoutLairUses(at.name) !== null,
    actions: htmlHasContent(monster.descriptionHtml?.lair),
  };
}

/**
 * Gives the creature a lair: the tick, the extra resistance, and a place to
 * type its lair actions.
 *
 * The session is updated synchronously, before the transaction — the menu item
 * that calls this has already closed its menu, and the section has to be on the
 * block before the render that follows or there is nothing for the caret to
 * land in.
 */
export function addLair(store: EditorStore): Promise<void> {
  const monster = store.getMonster();
  if (!monster) return Promise.resolve();

  const commands: Command[] = [];
  const at = resistance(monster);
  const traits = at && amendTraits(monster, at, withLairUses);
  if (traits !== null && traits !== undefined) {
    commands.push(edit.setDescription(monster, "traits", traits));
  }
  commands.push(edit.setHasLair(monster, true));

  const session = store.getSession();
  store.update({
    revealedSections: revealSection(session, "lair"),
    pendingFocus: sectionFocusKey("lair"),
    // Amended or already right, the trait is what the author needs to look at —
    // the count is theirs to agree with. Named as it will *end up*, since the
    // spotlight is resolved by name on the render after this.
    pendingSpotlight: at ? entrySpotlightKey("traits", withLairUses(at.name) ?? at.name) : null,
  });

  return store.commands.transaction(commands, "Add lair");
}

/** Takes the lair away, and everything that came with it. */
export function removeLair(store: EditorStore): Promise<void> {
  const monster = store.getMonster();
  if (!monster) return Promise.resolve();

  const commands: Command[] = [];
  const at = resistance(monster);
  const traits = at && amendTraits(monster, at, withoutLairUses);
  if (traits !== null && traits !== undefined) {
    commands.push(edit.setDescription(monster, "traits", traits));
  }
  if (htmlHasContent(monster.descriptionHtml?.lair)) {
    commands.push(edit.setDescription(monster, "lair", ""));
  }
  commands.push(edit.setHasLair(monster, false));

  store.update({ revealedSections: unrevealSection(store.getSession(), "lair") });
  return store.commands.transaction(commands, "Remove lair");
}
