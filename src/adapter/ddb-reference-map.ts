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
  /**
   * Where D&D Beyond keeps a *page* for this, when the compendium's own path
   * hasn't got one. Only the id lookup uses it; the tooltip is always fetched
   * from `path` — see `BROWSED_AT`.
   */
  browse?: string;
}

/**
 * What `[items]` can mean, in the order worth trying.
 *
 * It is the one macro that does not say which compendium it means. D&D
 * Beyond's own 2024 stat blocks write the Gear row as
 * `[items]Greatsword[/items], [items]splint;Splint Armor[/items]` — mundane
 * equipment — and the same macro is the natural spelling for a magic item.
 * The two live in different compendiums with disjoint slugs: `/magic-items/
 * greatsword` 404s and so does `/equipment/bag-of-holding`.
 *
 * Magic items first, because that is the macro's primary meaning and the only
 * candidate that resolves in a single probe. The other three share one
 * `/equipment` lookup (see `BROWSED_AT`), so trying all of them costs one
 * redirect and up to three cheap tooltips.
 *
 * Order alone would not be enough to pick between them, which is why the
 * resolver checks the name — see `ddb-references.ts`.
 */
const ITEM_PATHS: readonly DdbPath[] = ["magic-items", "weapons", "armor", "adventuring-gear"];

/**
 * DDB's macro vocabulary, which is not consistent — `[condition]` is singular,
 * `[spells]` is plural, and `[rules]` names a path that 404s (the live one is
 * `rules-glossary`). So the table absorbs both spellings of everything and
 * corrects the two that lie.
 *
 * Every entry is a *list*, because one of them has to be (`ITEM_PATHS`). All
 * the others name exactly one compendium, and a single-candidate lookup is
 * resolved exactly as it always was.
 */
const PATHS_BY_MACRO: Readonly<Record<string, readonly DdbPath[]>> = {
  condition: ["conditions"],
  conditions: ["conditions"],
  sense: ["senses"],
  senses: ["senses"],
  skill: ["skills"],
  skills: ["skills"],
  action: ["actions"],
  actions: ["actions"],
  "weapon-property": ["weapon-properties"],
  "weapon-properties": ["weapon-properties"],
  rule: ["rules-glossary"],
  rules: ["rules-glossary"],
  "rules-glossary": ["rules-glossary"],
  lore: ["lore-glossary"],
  "lore-glossary": ["lore-glossary"],
  spell: ["spells"],
  spells: ["spells"],
  monster: ["monsters"],
  monsters: ["monsters"],
  item: ITEM_PATHS,
  items: ITEM_PATHS,
  "magic-item": ITEM_PATHS,
  "magic-items": ITEM_PATHS,
  // These three do say which compendium they mean, so they stay single: the id
  // off `/equipment`'s redirect is the one that compendium wants.
  equipment: ["adventuring-gear"],
  "adventuring-gear": ["adventuring-gear"],
  armor: ["armor"],
  weapon: ["weapons"],
  weapons: ["weapons"],
  vehicle: ["vehicles"],
  vehicles: ["vehicles"],
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
 * The three compendiums with no page of their own.
 *
 * `/adventuring-gear/chain-mail`, `/armor/chain-mail` and `/weapons/club` all
 * 404 — D&D Beyond browses every one of them at `/equipment`, which does
 * redirect a name to a numbered URL (`/equipment/16-chain-mail`). Where the
 * macro says *which* of the three a reference means, the id read off that
 * redirect is the id that compendium wants; verified against 90 of their own
 * rows.
 *
 * Where it doesn't — `[items]` — the id is still right and the *path* is the
 * open question, and it cannot be answered by trying them in turn and taking
 * the first that answers: the three number their contents separately, so
 * `/weapons/17` is a Shortbow while `/armor/17` is Splint, and both are real.
 * That is why the resolver checks the name it got back before believing it.
 *
 * Without this, an equipment reference could never be resolved by name at all,
 * in either direction.
 */
const BROWSED_AT: Partial<Record<DdbPath, string>> = {
  "adventuring-gear": "equipment",
  armor: "equipment",
  weapons: "equipment",
};

/**
 * Where a token could point, best candidate first, or empty when we don't
 * recognise it.
 *
 * `ddb-markup.ts`'s reference regex is generic — any `[foo]…[/foo]` D&D Beyond
 * invents arrives here as `data-ref="foo"` — so answering with nothing is how
 * we stay honest about the ones we've never seen, rather than guessing a path
 * and asking their server about it.
 *
 * A `data-slug` wins over the display text outright: it *is* DDB's own link
 * target, already in their spelling, which is why `[rules]shape-shifting;
 * shape-shifts[/rules]` must look up `shape-shifting` and not the words the
 * sentence happens to read.
 *
 * All but `[items]` answer with exactly one target.
 */
export function refToTargets(token: RefToken): ReferenceTarget[] {
  const paths = PATHS_BY_MACRO[token.ref.trim().toLowerCase()];
  if (!paths) return [];
  const slug = slugify(token.slug ?? token.text);
  if (!slug) return [];
  return paths.map((path) => {
    const browse = BROWSED_AT[path];
    return browse ? { path, slug, browse } : { path, slug };
  });
}

/**
 * What a token is, for anyone keeping one answer per reference — the resolver's
 * cache and the preloader's "asked about that already".
 *
 * Every candidate, not just the first: two macros that resolve the same way
 * *are* the same question, and two that don't must never share an answer.
 * Empty when the macro means nothing to us.
 */
export function refKey(token: RefToken): string | null {
  const targets = refToTargets(token);
  if (targets.length === 0) return null;
  return `${targets.map((target) => target.path).join("|")}/${targets[0]!.slug}`;
}
