/**
 * Taking one entry off a creature the author is comparing against, onto theirs.
 *
 * The compare panel hands over a fragment of D&D Beyond's rendered monster page
 * and the section it was printed under; this is what makes it part of the
 * creature being edited. Three things have to happen together, which is why it
 * is a module rather than a line in a click handler:
 *
 *   - the page's markup becomes the editor's (`detailsToEditorHtml`),
 *   - a section D&D Beyond keeps behind a checkbox gets its checkbox ticked,
 *     because prose written into an unticked one is dropped on the next save,
 *   - and the whole thing is one entry in the undo stack, so a mis-click is one
 *     ⌘Z rather than two.
 *
 * Appending rather than replacing is deliberate. A creature that already has a
 * Multiattack and is handed another one ends up with both, side by side, for
 * the author to choose between — the alternative is a one-click button that
 * destroys prose they wrote.
 */
import type { Command } from "./command.js";
import type { EditorStore } from "./store.js";
import type { Monster, SectionKey } from "../statblock/model.js";
import * as edit from "./commands.js";
import { detailsToEditorHtml } from "../adapter/ddb-details.js";
import { entryName, joinItems, splitItems } from "../ui/prose/section-items.js";
import { entrySpotlightKey, revealSection } from "./session.js";

/**
 * The command that opens a gated section, or nothing when it isn't gated or is
 * already open.
 *
 * The three checkboxes, and only these three: every other section is on the
 * form unconditionally, and writing to one needs no permission.
 */
function gate(monster: Monster, section: SectionKey): Command | null {
  if (section === "legendary" && !monster.isLegendary) return edit.setLegendary(monster, true);
  if (section === "lair" && !monster.hasLair) return edit.setHasLair(monster, true);
  if (section === "mythic" && !monster.isMythic) return edit.setMythic(monster, true);
  return null;
}

/** Whether this section already holds an entry opening with this name. */
export function sectionHasEntry(monster: Monster, section: SectionKey, name: string): boolean {
  if (!name) return false;
  const wanted = name.trim().toLowerCase();
  return splitItems(monster.descriptionHtml?.[section] ?? "").some(
    (item) => entryName(item).trim().toLowerCase() === wanted,
  );
}

/**
 * Appends one compared entry to the matching section of the live creature.
 *
 * The session is updated first and synchronously, as `makeLegendary` does: the
 * spotlight has to be set before the render the write provokes, or the entry
 * arrives with nothing to say it did.
 */
export function importEntry(
  store: EditorStore,
  section: SectionKey,
  detailsHtml: string,
): Promise<void> {
  const monster = store.getMonster();
  if (!monster) return Promise.resolve();
  const html = detailsToEditorHtml(detailsHtml).trim();
  if (!html) return Promise.resolve();

  const commands: Command[] = [];
  const open = gate(monster, section);
  if (open) commands.push(open);
  const items = splitItems(monster.descriptionHtml?.[section] ?? "");
  commands.push(edit.setDescription(monster, section, joinItems([...items, html])));

  const session = store.getSession();
  store.update({
    revealedSections: revealSection(session, section),
    // By name rather than by index, so the wash finds it after the form has
    // been read back and the section re-split.
    pendingSpotlight: entrySpotlightKey(section, entryName(html)),
  });

  return store.commands.transaction(commands, "Import entry");
}
