/**
 * Which D&D Beyond compendium a `.ref` token points into, and under what slug.
 *
 * A reference reaches us as the macro D&D Beyond stored — `[condition]Grappled
 * [/condition]`, `[rules]shape-shifting;shape-shifts[/rules]` — which
 * `ddb-markup.ts` has already split into a type, an optional slug and the
 * display text. What it does *not* carry is the numeric id DDB's tooltip
 * endpoint wants, so this module's job is the half of the lookup that needs no
 * network: macro type → compendium path, and name → slug.
 *
 * It is deliberately pure. The paths are a closed set copied from CurseTip's
 * own whitelist (the `Paths` option in `waterdeep.js`), so a `DdbPath` is
 * always a literal we wrote — never a string that came out of page HTML.
 */
import type { RefToken } from "./types.js";

/**
 * The compendium paths DDB's tooltip endpoint serves. Two of theirs are left
 * out on purpose: `characters` (nothing in a stat block references one) and
 * `dicerolls` (that belongs to the `.roll` token, not `.ref`).
 */
export type DdbPath =
  | "conditions"
  | "senses"
  | "skills"
  | "actions"
  | "weapon-properties"
  | "rules-glossary"
  | "lore-glossary"
  | "spells"
  | "monsters"
  | "magic-items"
  | "adventuring-gear"
  | "armor"
  | "weapons"
  | "vehicles";

/** Where a token points: a path we control, and the slug to look up in it. */
export interface ReferenceTarget {
  path: DdbPath;
  slug: string;
}

/**
 * DDB's macro vocabulary, which is not consistent — `[condition]` is singular,
 * `[spells]` is plural, and `[rules]` names a path that 404s (the live one is
 * `rules-glossary`). So the table absorbs both spellings of everything and
 * corrects the two that lie.
 */
const PATH_BY_MACRO: Readonly<Record<string, DdbPath>> = {
  condition: "conditions",
  conditions: "conditions",
  sense: "senses",
  senses: "senses",
  skill: "skills",
  skills: "skills",
  action: "actions",
  actions: "actions",
  "weapon-property": "weapon-properties",
  "weapon-properties": "weapon-properties",
  rule: "rules-glossary",
  rules: "rules-glossary",
  "rules-glossary": "rules-glossary",
  lore: "lore-glossary",
  "lore-glossary": "lore-glossary",
  spell: "spells",
  spells: "spells",
  monster: "monsters",
  monsters: "monsters",
  item: "magic-items",
  items: "magic-items",
  "magic-item": "magic-items",
  "magic-items": "magic-items",
  equipment: "adventuring-gear",
  "adventuring-gear": "adventuring-gear",
  armor: "armor",
  weapon: "weapons",
  weapons: "weapons",
  vehicle: "vehicles",
  vehicles: "vehicles",
};

/**
 * A display name as D&D Beyond slugs it in a URL.
 *
 * Apostrophes are *deleted* rather than treated as separators, because that is
 * what DDB does: `Bigby's Hand` is `bigbys-hand`, not `bigby-s-hand`. Everything
 * else that isn't a letter or digit collapses to a single dash.
 *
 * This is also what keys the harvested id tables, so one spelling serves both
 * the table lookup and the live URL.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['‘’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Where a token points, or null when we don't recognise it.
 *
 * `ddb-markup.ts`'s reference regex is generic — any `[foo]…[/foo]` D&D Beyond
 * invents arrives here as `data-ref="foo"` — so returning null is how we stay
 * honest about the ones we've never seen, rather than guessing a path and
 * asking their server about it.
 *
 * A `data-slug` wins over the display text outright: it *is* DDB's own link
 * target, already in their spelling, which is why `[rules]shape-shifting;
 * shape-shifts[/rules]` must look up `shape-shifting` and not the words the
 * sentence happens to read.
 */
export function refToTarget(token: RefToken): ReferenceTarget | null {
  const path = PATH_BY_MACRO[token.ref.trim().toLowerCase()];
  if (!path) return null;
  const slug = slugify(token.slug ?? token.text);
  return slug ? { path, slug } : null;
}
