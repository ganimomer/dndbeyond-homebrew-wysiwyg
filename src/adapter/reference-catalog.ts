/**
 * The references an author can pick from a menu, and what to write when they do.
 *
 * `ddb-reference-map.ts` answers "where does this macro point?" — the reading
 * direction, where the macro already exists and carries its own display text.
 * This is the writing direction, and it needs the thing that direction never
 * did: the *contents* of a compendium, by name.
 *
 * A kind's entities come from one of two places, and the kind says which.
 * **A table**: the six compendiums whose whole contents are committed in
 * `ddb-reference-ids.ts`, listed in full and filtered in the menu. **A
 * listing**: D&D Beyond's own browse page, which for spells, monsters and items
 * is the only search there is — they are open-ended and entitlement-dependent,
 * and DDB has no JSON endpoint to ask (`/api/search` 404s). Nothing in this
 * module fetches either; a listing kind simply has no entities to offer here.
 *
 * Pure: no network, no DOM.
 */
import { REFERENCE_IDS, REFERENCE_NAMES } from "./ddb-reference-ids.js";
import { slugify, type DdbPath } from "./ddb-reference-map.js";

/** One row of the "what kind of thing?" menu. */
export interface ReferenceKind {
  /**
   * The macro spelling written into DDB's markup. `PATH_BY_MACRO` accepts
   * several per path; these are the ones a real homebrew form was observed to
   * contain, so what we write is indistinguishable from what DDB writes.
   */
  macro: string;
  path: DdbPath;
  /** The menu row, which the menu itself suffixes with an ellipsis. */
  label: string;
  /**
   * Where the "which one?" stage gets its rows. `table` lists `entitiesOf`;
   * `listing` has none to list, and offers D&D Beyond's own browse page
   * instead.
   */
  source: "table" | "listing";
  /**
   * Which page to frame, when it isn't the compendium's own path.
   *
   * Only `/equipment` needs it, and it needs it because that one page *is*
   * three compendiums — gear, armor and weapons. Two things follow, and both
   * matter: a row has to say which of the three it belongs to (see
   * `rowTarget`), and a row's id is the **listing's**, which coincides with the
   * compendium's only for items the author owns. A wrong id there resolves to
   * a different real item rather than to nothing, so where this is set a picked
   * id is not worth keeping.
   */
  listing?: string;
}

/** One row of the "which one?" menu, and the reference it inserts. */
export interface ReferenceEntity {
  /** What the author reads, and what goes into the prose. */
  name: string;
  /** DDB's own URL spelling, which is what actually resolves. */
  slug: string;
}

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  // The two open-ended ones first: a spell is the reference a stat block reaches
  // for most, a monster the next, and they are the two an author can't be shown
  // a list of. Both macros are plural — the spelling a real homebrew form was
  // captured containing (`[monsters]Vampire Spawn[/monsters]`).
  { macro: "spells", path: "spells", label: "Spell", source: "listing" },
  { macro: "monsters", path: "monsters", label: "Monster", source: "listing" },
  // `items`, following the plural the other two are written in. Unlike theirs,
  // this spelling is a guess: no captured form contains a magic-item macro.
  // `PATH_BY_MACRO` reads all four spellings, so a guess costs nothing to read.
  { macro: "items", path: "magic-items", label: "Magic item", source: "listing" },
  { macro: "condition", path: "conditions", label: "Condition", source: "table" },
  { macro: "skill", path: "skills", label: "Skill", source: "table" },
  { macro: "sense", path: "senses", label: "Sense", source: "table" },
  { macro: "action", path: "actions", label: "Action", source: "table" },
  { macro: "weapon-property", path: "weapon-properties", label: "Weapon property", source: "table" },
  // `rules`, not `rule`: it is the spelling a live homebrew form was found to
  // contain, and `PATH_BY_MACRO` corrects it to the path that exists.
  { macro: "rules", path: "rules-glossary", label: "Rule", source: "table" },
  {
    macro: "equipment",
    path: "adventuring-gear",
    label: "Equipment",
    source: "listing",
    listing: "equipment",
  },
  // Last because it is the rarest thing on a stat block, and a table rather
  // than a listing because DDB's vehicle *page* links to `/vehicles/galley`
  // with no id in it — there are 31 of them, so they are shipped instead.
  // Plural like the other book content; unobserved, as `items` is.
  { macro: "vehicles", path: "vehicles", label: "Vehicle", source: "table" },
];

export function kindByMacro(macro: string): ReferenceKind | undefined {
  return REFERENCE_KINDS.find((kind) => kind.macro === macro);
}

/**
 * The kinds a half-typed slash command could still mean.
 *
 * Matched on the start of a word rather than anywhere in the label, because
 * `/pro` meaning "Weapon property" is a coincidence an author would have to
 * discover, while `/weapon` and `/property` are both things they might
 * reasonably try. An empty query matches everything, which is the state a
 * freshly typed slash is in.
 */
export function kindsMatching(query: string): ReferenceKind[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...REFERENCE_KINDS];
  return REFERENCE_KINDS.filter((kind) =>
    kind.label
      .toLowerCase()
      .split(/[\s-]+/)
      .some((word) => word.startsWith(needle)),
  );
}

/**
 * Entries DDB serves that are not things anyone would reference. `/senses/5` is
 * their "Unknown" placeholder — it resolves, so the harvester faithfully keeps
 * it, and it would sit in the menu between Truesight and nothing.
 */
const NOT_AN_ENTITY: Partial<Record<DdbPath, readonly string[]>> = {
  senses: ["unknown"],
};

/** `Dexterity (Acrobatics)` — how DDB names a skill, and nobody else does. */
const ABILITY_PREFIXED = /^\w+ \((.+)\)$/;

/**
 * Everything in a compendium, in the order a menu should show it.
 *
 * Two things stand between the harvested table and a list of rows. The table is
 * keyed by *every* spelling of a slug — `acrobatics` and `dexterity-acrobatics`
 * are both id 3 — so rows are grouped by id and the canonical spelling (the one
 * the name table knows) wins. And a skill's DDB name carries the ability that
 * governs it, which a stat block never repeats mid-sentence: "makes an
 * Acrobatics check", not "makes a Dexterity (Acrobatics) check".
 */
export function entitiesOf(path: DdbPath): ReferenceEntity[] {
  const ids = REFERENCE_IDS[path] ?? {};
  const names = REFERENCE_NAMES[path] ?? {};
  const excluded = NOT_AN_ENTITY[path] ?? [];

  /** id → the slug to show it under. */
  const canonical = new Map<number, string>();
  for (const [slug, id] of Object.entries(ids)) {
    if (excluded.includes(slug)) continue;
    const held = canonical.get(id);
    // A slug the name table knows is the one the harvester chose to call
    // canonical. Failing that (a table harvested before names existed), the
    // shorter spelling is the bare one — `acrobatics` over `dexterity-…`.
    if (held === undefined || (!(held in names) && (slug in names || slug.length < held.length))) {
      canonical.set(id, slug);
    }
  }

  return [...canonical.values()]
    .map((slug) => ({ name: displayName(path, slug, names[slug]), slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function displayName(path: DdbPath, slug: string, harvested: string | undefined): string {
  // A clone that hasn't re-run the harvest still gets a usable menu, and
  // sharpens to DDB's own wording when it does.
  const name = harvested ?? titleCase(slug);
  if (path !== "skills") return name;
  return ABILITY_PREFIXED.exec(name)?.[1] ?? name;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Which compendium a listing row belongs to, where one listing serves several.
 *
 * Only `/equipment` does: its rows are adventuring gear, armor and weapons
 * together, and the three are separate compendiums with separate id spaces.
 * D&D Beyond says which by the icon it draws on the row — `equipment-heavy-armor`,
 * `equipment-simple-melee-weapon`, `equipment-tool` — and the suffix is the
 * whole rule. Checked against 90 of their own rows: every one the author can
 * reach answers, under the path this picks, with the name the row shows.
 *
 * A category we don't recognise falls back to the kind's own compendium, which
 * is where the great majority of that listing lives anyway.
 */
export function rowTarget(kind: ReferenceKind, category?: string): { macro: string; path: DdbPath } {
  if (category?.endsWith("-weapon")) return { macro: "weapon", path: "weapons" };
  if (category?.endsWith("-armor") || category === "shield") {
    return { macro: "armor", path: "armor" };
  }
  return { macro: kind.macro, path: kind.path };
}

/**
 * What a reference to this entity should carry as its link target, or nothing
 * when the display text already says it.
 *
 * A macro may name its target explicitly — `[rules]shape-shifting;shape-shifts
 * [/rules]` — but DDB's own stat blocks only bother when the words on the page
 * differ from the slug, and every entity here is named exactly what it slugs
 * to. So the common case writes `[condition]Grappled[/condition]`, which is
 * byte-for-byte what DDB writes.
 */
export function slugToWrite(entity: ReferenceEntity): string | undefined {
  return slugify(entity.name) === entity.slug ? undefined : entity.slug;
}

/**
 * An entity out of a name an author typed, for the kinds there is no list of.
 *
 * The slug is the name's own, which is the same bargain a picked entity makes:
 * `slugToWrite` then leaves it off the macro, and the resolver slugifies the
 * display text back to it. That is also why the name has to be exact — a
 * misspelling isn't wrong here, it just points at a spell D&D Beyond hasn't got.
 */
export function typedEntity(name: string): ReferenceEntity {
  const trimmed = name.trim();
  return { name: trimmed, slug: slugify(trimmed) };
}
