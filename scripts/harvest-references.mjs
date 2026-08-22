// @ts-nocheck
/**
 * Harvests D&D Beyond's slug → id tables for the *closed* compendiums.
 *
 *   npm run harvest:references
 *
 * A tooltip URL needs a numeric id (`/conditions/2/tooltip`), but the macros
 * DDB stores in a monster's prose carry a name (`[condition]Grappled[/condition]`).
 * For the open compendiums — spells, monsters, magic items — a name resolves at
 * runtime, because their canonical slug URL 301s to the numbered one. The closed
 * ones have no slug URL at all (`/conditions/charmed` 404s), so the only way to
 * learn the mapping is to walk the ids and read the name back out.
 *
 * They are small and they barely change, so we walk them once, by hand, and
 * commit the result: a fresh clone then works offline, and a cold hover costs
 * one request instead of two.
 *
 * Deliberately *not* part of `npm run build` — a build should never need the
 * network, and this would hammer DDB on every rebuild.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://www.dndbeyond.com";
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/adapter/ddb-reference-ids.ts",
);

/**
 * Ranges overshoot the ids known to exist today, so a compendium that grows is
 * picked up on the next run and the gaps cost nothing but a 404. Observed at
 * time of writing: conditions 1–15, skills 2–19, senses 1–5, actions 1–11 with
 * gaps, weapon-properties 1–15 with gaps, rules-glossary 1–127 contiguous.
 */
const PATHS = {
  conditions: 20,
  skills: 25,
  senses: 10,
  actions: 15,
  "weapon-properties": 20,
  "rules-glossary": 160,
};

/** Mirrors `slugify` in src/adapter/ddb-reference-map.ts — see the note there. */
function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#39);/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The name out of a tooltip's header.
 *
 * The header's shape varies by type — a condition puts its name straight into
 * `tooltip-header-text`, a spell wraps it in a `tooltip-header-title`, and a
 * rule nests a `<span>` inside that again — so rather than match each shape,
 * take the header block, cut it before whatever follows the name (the source
 * subtitle, or the type badge), and strip what tags are left. No DOM in node,
 * and the markup is stable enough that this is honest.
 */
function nameOf(html) {
  const start = html.indexOf('tooltip-header-text">');
  if (start < 0) return "";
  let block = html.slice(start + 'tooltip-header-text">'.length);
  for (const marker of ["tooltip-header-subtitle", "tooltip-header-identifier"]) {
    const cut = block.indexOf(marker);
    if (cut >= 0) block = block.slice(0, cut);
  }
  // Cutting at the marker lands *inside* the opening tag that carries it, so
  // drop the unterminated tail before stripping, or `<div class=` survives as
  // text and ends up in the slug.
  block = block.replace(/<[^>]*$/, "").replace(/<[^>]*>/g, " ");
  return decodeEntities(block).replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A skill's tooltip names it as `Intelligence (Arcana)`. Nobody has yet
 * observed which spelling a real `[skill]` macro uses, so emit both.
 */
function keysFor(path, name) {
  const keys = [slugify(name)];
  if (path === "skills") {
    const bare = /\(([^)]+)\)\s*$/.exec(name);
    if (bare) keys.unshift(slugify(bare[1]));
  }
  return [...new Set(keys)].filter(Boolean);
}

async function harvest(path, max) {
  const table = {};
  /** Canonical slug → the name DDB prints, for the picker's rows. */
  const names = {};
  const blocked = [];
  for (let id = 1; id <= max; id++) {
    let payload;
    try {
      const res = await fetch(`${ORIGIN}/${path}/${id}/tooltip`);
      if (!res.ok) continue;
      const text = (await res.text()).trim();
      if (!text.startsWith("(")) continue; // DDB's 404 is a whole HTML page
      payload = JSON.parse(text.slice(1, -1));
    } catch {
      continue;
    }
    // A paywalled entry answers `{"Type":"blocked","Id":0}` with no name, so it
    // would drop out of the table without trace. Every closed compendium is
    // free-rules content today; if that ever changes we want to be told, not to
    // ship a table with a hole in it.
    if (payload.Type === "blocked") {
      blocked.push(id);
      continue;
    }
    const name = nameOf(payload.Tooltip ?? "");
    if (!name) continue;
    const keys = keysFor(path, name);
    for (const key of keys) table[key] = payload.Id || id;
    // Only the first key, which `keysFor` puts in the spelling a stat block
    // reads — `arcana`, not `intelligence-arcana`. The aliases exist so a macro
    // written either way still resolves; they are not separate things to pick.
    if (keys[0]) names[keys[0]] = name;
    await sleep(100);
  }
  return { table, names, blocked };
}

const tables = {};
const nameTables = {};
const problems = [];
for (const [path, max] of Object.entries(PATHS)) {
  const { table, names, blocked } = await harvest(path, max);
  tables[path] = table;
  nameTables[path] = names;
  if (blocked.length) problems.push(`${path}: blocked ids ${blocked.join(", ")}`);
  console.log(`${path.padEnd(18)} ${String(Object.keys(table).length).padStart(4)} keys`);
}

// Keys sorted and no timestamp, so re-running with nothing changed produces an
// empty diff — a generated file that churns is one nobody re-runs.
function render(byPath, value) {
  return Object.entries(byPath)
    .map(([path, table]) => {
      const entries = Object.keys(table)
        .sort()
        .map((key) => `    ${JSON.stringify(key)}: ${value(table[key])},`)
        .join("\n");
      return `  ${JSON.stringify(path)}: {\n${entries}\n  },`;
    })
    .join("\n");
}

writeFileSync(
  OUT,
  `/**
 * D&D Beyond's closed compendiums, as slug → id and slug → name.
 * **Generated — do not edit.**
 *
 *   npm run harvest:references
 *
 * Committed on purpose: these ids barely change, and having them here means a
 * fresh clone resolves a condition or a glossary term with no network at all,
 * and a cold hover costs one request instead of two. A miss just falls through
 * to the live slug lookup, so a stale table degrades rather than breaks.
 *
 * The names are what makes these compendiums *pickable* — a slug is a URL
 * fragment, and "sleight-of-hand" is not what an author wants to read in a
 * menu. Keyed only by the canonical slug, so the alias keys in \`REFERENCE_IDS\`
 * (which exist so a macro written either way resolves) don't become duplicate
 * rows. \`reference-catalog.ts\` title-cases the slug where a name is missing,
 * so the picker works on a clone that hasn't re-run the harvest.
 */
import type { DdbPath } from "./ddb-reference-map.js";

export const REFERENCE_IDS: Partial<Record<DdbPath, Readonly<Record<string, number>>>> = {
${render(tables, (id) => id)}
};

export const REFERENCE_NAMES: Partial<Record<DdbPath, Readonly<Record<string, string>>>> = {
${render(nameTables, (name) => JSON.stringify(name))}
};
`,
);

console.log(`\nwrote ${OUT}`);
if (problems.length) {
  console.error(`\nblocked entries — re-harvest these while signed in:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
