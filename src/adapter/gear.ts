/**
 * Reading a Gear line for the things that change the rest of the stat block.
 *
 * Most of what a creature carries is a name on a line. A few pieces are not: a
 * shield is worth two points of armor class, and nothing on D&D Beyond's form
 * connects the two — the Gear input and the armor-class input do not know each
 * other exists. This is the side of that connection that knows *how DDB spells
 * a shield*; `statblock/armor.ts` knows what one is worth.
 *
 * Pure string work over the stored field value, so it answers without an editor
 * and without the page. That matters because the question is asked at the
 * moment the Gear row commits, about the text it is committing.
 */
import { macroRefs } from "./ddb-markup.js";
import { ITEM_PATHS, refToTargets } from "./ddb-reference-map.js";
import { SHIELD } from "../statblock/armor.js";

/**
 * Whether this Gear line carries a shield.
 *
 * Asked of the *targets* a reference resolves to rather than of the words in
 * it, which settles four things at once. It reads every spelling that occurs —
 * `[armor]Shield[/armor]` from D&D Beyond's Equipment listing,
 * `[items]shield;Shield[/items]` from their own stat blocks, and
 * `[equipment]Shield[/equipment]` from an author who typed the name rather than
 * picking it. It follows the slug where the display text has been reworded to
 * "his father's battered kite". It answers only for *references*, so the words
 * "a shield" in a sentence are not one. And it declines the **spell** Shield,
 * which resolves to a compendium of its own — a wizard whose gear lists it is
 * not carrying one.
 *
 * The macros differ on which equipment compendium they mean and only DDB knows
 * which is right, so the test is the whole item family rather than `armor`
 * alone. Nothing else in any of them is slugged `shield`.
 */
export function gearHasShield(gear: string): boolean {
  return macroRefs(gear).some((token) =>
    refToTargets(token).some(
      (target) => target.slug === SHIELD.slug && ITEM_PATHS.includes(target.path),
    ),
  );
}
