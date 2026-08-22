/**
 * The references an author can pick from a menu, and what to write when they do.
 *
 * `ddb-reference-map.ts` answers "where does this macro point?" — the reading
 * direction, where the macro already exists and carries its own display text.
 * This is the writing direction, and it needs the thing that direction never
 * did: the *contents* of a compendium, by name.
 *
 * Only the six compendiums whose whole contents are already committed in
 * `ddb-reference-ids.ts` are here. Spells, monsters and items are open-ended
 * and entitlement-dependent — they need a search, not a list, and D&D Beyond
 * has no JSON endpoint for one (their own listing pages are the only
 * entitlement-aware search, at 230–750 KB a query). They arrive as a second
 * source behind the same menu, which is why `ReferenceKind` says nothing about
 * where its entities come from.
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
}

/** One row of the "which one?" menu, and the reference it inserts. */
export interface ReferenceEntity {
  /** What the author reads, and what goes into the prose. */
  name: string;
  /** DDB's own URL spelling, which is what actually resolves. */
  slug: string;
}

export const REFERENCE_KINDS: readonly ReferenceKind[] = [
  { macro: "condition", path: "conditions", label: "Condition" },
  { macro: "skill", path: "skills", label: "Skill" },
  { macro: "sense", path: "senses", label: "Sense" },
  { macro: "action", path: "actions", label: "Action" },
  { macro: "weapon-property", path: "weapon-properties", label: "Weapon property" },
  // `rules`, not `rule`: it is the spelling a live homebrew form was found to
  // contain, and `PATH_BY_MACRO` corrects it to the path that exists.
  { macro: "rules", path: "rules-glossary", label: "Rule" },
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
