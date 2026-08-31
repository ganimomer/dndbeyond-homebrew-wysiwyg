/**
 * The armor a creature can be wearing, and what wearing it is worth.
 *
 * D&D Beyond stores an armor class as one number and a free-text qualifier, and
 * stores gear as a line of item references. Neither knows the other exists — so
 * swapping Splint Armor for Chain Mail in the Gear row leaves a 17 standing
 * behind that nothing can explain. This table is what connects them: it is the
 * only place in the editor that knows splint is a flat 17 and half plate is
 * 15 plus as much Dexterity as it will take.
 *
 * The *table* is mundane body armor only, and deliberately so: what belongs in
 * it is the set of things that replace each other, since replacing is the whole
 * gesture it exists to serve. A shield is not one of them — it is worn
 * alongside armor rather than instead of it — so it sits outside the table as
 * `SHIELD`, a flat bonus and a word for the parentheses.
 *
 * Magic armor ("Splint, +1") is still absent, because it varies by the item
 * rather than by the kind.
 *
 * Rules knowledge, so it is DOM-free and network-free like everything else in
 * this directory. The compendium ids and macros live in the adapter.
 */

/** How much of a creature's Dexterity its armor lets through. */
export type DexRule =
  /** Light armor: all of it. */
  | "full"
  /** Medium armor: at most +2. */
  | "cap2"
  /** Heavy armor: none of it. */
  | "none";

export interface Armor {
  /** As the palette lists it, and as it goes into the Gear reference. */
  name: string;
  /**
   * D&D Beyond's URL spelling. Every name here slugifies to exactly this, which
   * is what lets `slugToWrite` leave it off the macro — so what we write is
   * `[armor]Splint Armor[/armor]`, byte-for-byte what DDB writes.
   */
  slug: string;
  /**
   * Other spellings a reference already on the page might carry. D&D Beyond's
   * own Warrior Veteran says `[items]splint;Splint Armor[/items]`, so "splint"
   * has to find splint armor even though the compendium calls it neither.
   */
  aliases?: readonly string[];
  /** The class before any Dexterity is added. */
  base: number;
  dex: DexRule;
  /** What the armor-class row prints in parentheses — "splint", "half plate". */
  qualifier: string;
}

/**
 * The SRD's mundane body armor, in the order its own table reads: light, then
 * medium, then heavy, ascending within each. Not sorted alphabetically, because
 * an author choosing armor is choosing along exactly this axis.
 */
export const MUNDANE_ARMOR: readonly Armor[] = [
  // Light — the whole Dexterity modifier.
  { name: "Padded Armor", slug: "padded-armor", aliases: ["padded"], base: 11, dex: "full", qualifier: "padded" },
  { name: "Leather Armor", slug: "leather-armor", aliases: ["leather"], base: 11, dex: "full", qualifier: "leather" },
  {
    name: "Studded Leather Armor",
    slug: "studded-leather-armor",
    aliases: ["studded-leather"],
    base: 12,
    dex: "full",
    qualifier: "studded leather",
  },
  // Medium — capped at +2.
  { name: "Hide Armor", slug: "hide-armor", aliases: ["hide"], base: 12, dex: "cap2", qualifier: "hide" },
  { name: "Chain Shirt", slug: "chain-shirt", base: 13, dex: "cap2", qualifier: "chain shirt" },
  { name: "Scale Mail", slug: "scale-mail", base: 14, dex: "cap2", qualifier: "scale mail" },
  { name: "Breastplate", slug: "breastplate", aliases: ["breast-plate"], base: 14, dex: "cap2", qualifier: "breastplate" },
  {
    name: "Half Plate Armor",
    slug: "half-plate-armor",
    aliases: ["half-plate"],
    base: 15,
    dex: "cap2",
    qualifier: "half plate",
  },
  // Heavy — no Dexterity at all.
  { name: "Ring Mail", slug: "ring-mail", base: 14, dex: "none", qualifier: "ring mail" },
  { name: "Chain Mail", slug: "chain-mail", base: 16, dex: "none", qualifier: "chain mail" },
  { name: "Splint Armor", slug: "splint-armor", aliases: ["splint"], base: 17, dex: "none", qualifier: "splint" },
  { name: "Plate Armor", slug: "plate-armor", aliases: ["plate"], base: 18, dex: "none", qualifier: "plate" },
];

/**
 * A shield, which is not an `Armor` because it does not answer the same
 * question.
 *
 * Every row above says what a creature's class *is* once it is wearing that.
 * A shield says only what it adds, and it adds to whatever was there — the
 * armor the editor recognises, the natural armor it doesn't, or a number a
 * homebrew author simply decided on. So it has a `bonus` where they have a
 * `base` and a `dex`, and it stays out of `MUNDANE_ARMOR` so that nothing
 * offering "replace this armor with that one" can ever offer it.
 */
export const SHIELD = {
  /** As a reference to it reads, and as D&D Beyond's compendium spells it. */
  name: "Shield",
  slug: "shield",
  /** Flat, and the same for every creature carrying one. */
  bonus: 2,
  /** What it adds to the armor-class row's parentheses, always last. */
  qualifier: "shield",
} as const;

/**
 * The class this armor gives a creature with that Dexterity modifier.
 *
 * A *penalty* is never capped — the cap is on how much the armor will let a
 * nimble creature exploit, not on how much a clumsy one suffers, so a −1 in
 * half plate is 14 rather than 15.
 */
export function armorAc(armor: Armor, dexMod: number): number {
  switch (armor.dex) {
    case "full":
      return armor.base + dexMod;
    case "cap2":
      return armor.base + Math.min(dexMod, 2);
    case "none":
      return armor.base;
  }
}

/**
 * A name reduced to something two spellings of it can be compared by.
 *
 * This is *not* `slugify` from the adapter, though it agrees with it on every
 * name in the table. That one answers "how does D&D Beyond spell this in a
 * URL", which is their knowledge and belongs on their side of the line; this
 * one answers "are these two the same name", which is the only question asked
 * here. Keeping them apart is what keeps this directory free of D&D Beyond.
 */
function key(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Every spelling that finds an armor → the armor it finds. Built once. */
const BY_SLUG: ReadonlyMap<string, Armor> = new Map(
  MUNDANE_ARMOR.flatMap((armor) =>
    [armor.slug, ...(armor.aliases ?? [])].map((spelling) => [key(spelling), armor] as const),
  ),
);

/** The armor of exactly this name, for callers that already have DDB's own. */
export function armorByName(name: string): Armor | undefined {
  return BY_SLUG.get(key(name));
}

/**
 * The armor a gear reference names, or nothing where it names something else.
 *
 * Both halves of the token are tried, because either can be the one that says
 * so: DDB's own markup carries the short slug and the long display name
 * (`[items]splint;Splint Armor[/items]`), while an author who has reworded a
 * reference to read "his rusted mail" has left only the slug pointing home.
 */
export function armorFor(token: { text: string; slug?: string }): Armor | undefined {
  return armorByName(token.text) ?? (token.slug ? armorByName(token.slug) : undefined);
}
