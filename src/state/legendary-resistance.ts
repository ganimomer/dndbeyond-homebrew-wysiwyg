/**
 * The Legendary Resistance trait: how to find one, how to write one, and what a
 * lair does to its parenthetical.
 *
 * Its own module because two gestures act on it from opposite directions — the
 * crown adds the trait, and the castle amends the count inside its name — and
 * neither of those features is the other's business.
 *
 * The parenthetical is the delicate part. It is a small structured field
 * ("3/Day", "3/Day, or 4/Day in Lair") hiding inside a sentence the author owns
 * and may have rewritten, so everything here reads it conservatively and
 * declines rather than guesses: a trait with no count to scale is left alone.
 */
import type { Monster, Ruleset } from "../statblock/model.js";
import { entryName, splitItems } from "../ui/prose/section-items.js";

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

/** The uses parenthetical: the count, and anything else the author put with it. */
const USES = /\((\d+)\s*\/\s*Day\b([^)]*)\)/i;

/** The in-lair clause, as this module writes it and as an author might have. */
const IN_LAIR = /,?\s*or\s+\d+\s*\/\s*Day\s+in\s+Lair/i;

/**
 * The trait's sentence, per ruleset.
 *
 * The two read the same: the SRD wording didn't change between 2014 and 2024.
 * What *did* change is the parenthetical — a 2024 creature with a lair resists
 * more often at home — and that lives in the name rather than here, because it
 * follows the lair rather than the era. The table stays so a wording divergence
 * has somewhere obvious to go.
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
 * The trait's name with its in-lair uses added, or null when there is nothing
 * to do — it already says so, or there is no count to scale.
 *
 * One more than the count outside the lair, rather than a fixed four: four is
 * only right because three is the usual grant, and a creature its author made
 * more resistant shouldn't get *weaker* on its own ground.
 */
export function withLairUses(name: string): string | null {
  if (IN_LAIR.test(name)) return null;
  const match = name.match(USES);
  if (!match) return null;
  const uses = Number(match[1]);
  // `rest` is whatever else was in the brackets. It comes along untouched: an
  // author who wrote "(3/Day, recharges at dawn)" meant both halves.
  const rest = match[2] ?? "";
  return name.replace(match[0], `(${match[1]}/Day${rest}, or ${uses + 1}/Day in Lair)`);
}

/** The inverse: the name without its in-lair clause, or null if it had none. */
export function withoutLairUses(name: string): string | null {
  const match = name.match(IN_LAIR);
  return match ? name.replace(match[0], "") : null;
}

/**
 * The Legendary Resistance trait, as one entry.
 *
 * `<em><strong>` because that is the shape the section is cut on and the shape
 * Lexical's bold-italic new entry exports — an entry we write has to be
 * indistinguishable from one the author typed.
 */
export function legendaryResistanceHtml(
  monster: Monster,
  { inLair }: { inLair: boolean } = { inLair: false },
): string {
  const subject = monster.name.trim() ? `the ${monster.name.trim()}` : "the creature";
  const name = (inLair ? withLairUses(RESISTANCE_NAME) : null) ?? RESISTANCE_NAME;
  const body = RESISTANCE_BODY[monster.ruleset](escapeHtml(subject));
  return `<p><em><strong>${name}.</strong></em> ${body}</p>`;
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
