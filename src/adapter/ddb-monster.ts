/**
 * Adapter for D&D Beyond's homebrew *monster* editor
 * (`/homebrew/creations/monsters/<id>-<slug>/edit`).
 *
 * The editor is a server-rendered form with stable `id="field-*"` controls, so
 * reading is a matter of pulling values (and, for <select>s, the selected
 * option *text*, since the values are numeric codes). A few sections
 * — Movement, Skills, Senses — are listing tables rather than inputs, and the
 * trait/action bodies are ready-to-render HTML in `*-description-wysiwyg`
 * textareas. All of that DOM knowledge is centralized here.
 */
import type { PageAdapter } from "./types.js";
import {
  emptyMonster,
  type Ability,
  type Monster,
  type Ruleset,
  type SectionKey,
} from "../statblock/model.js";
import { abilityModifier, proficiencyForCr } from "../statblock/compute.js";

/** Every DOM hook the monster adapter needs, in one place. */
export const SELECTORS = {
  formRoot: "form#monster-form",
  ruleset: "field-stat-block-type",
  name: "field-Name",
  monsterType: "field-monster-type",
  subType: "field-monster-sub-type",
  size: "field-size",
  alignment: "field-alignment",
  challengeRating: "field-challenge-rating",
  armorClass: "field-armor-class",
  armorClassType: "field-armor-class-type",
  initiativeBonus: "field-initiative-bonus",
  passivePerception: "field-passive-perception",
  hpAverage: "field-average-hit-points",
  hpDieCount: "field-hit-points-die-count",
  hpDieValue: "field-hit-points-die-value",
  hpModifier: "field-hit-points-modifier",
  savingThrows: "field-monster-saving-throw",
  damageAdjustment: "field-damage-adjustment",
  conditionImmunity: "field-condition-immunity",
  gear: "field-gear-description",
  languages: "field-languages-note",
  isLegendary: "field-is-legendary",
  isMythic: "field-is-mythic",
  hasLair: "field-has-lair",
  movementTable: "table.listing-rpgmonster-movement-mapping",
  skillTable: "table.listing-rpgmonster-skill-mapping",
  senseTable: "table.listing-rpgmonster-sense-mapping",
} as const;

const URL_PATTERN = /\/homebrew\/creations\/monsters\/.*\/edit/i;

/** Ability id → the `field-<name>` slug DDB uses for scores and save overrides. */
const ABILITY_FIELD: Record<Ability, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

const ABBREV_TO_ABILITY: Record<string, Ability> = {
  STR: "str",
  DEX: "dex",
  CON: "con",
  INT: "int",
  WIS: "wis",
  CHA: "cha",
};

/** Description sections → the `field-<name>-description-wysiwyg` textarea id. */
const SECTION_TEXTAREA: Array<[SectionKey, string, keyof typeof SELECTORS | null]> = [
  ["traits", "field-special-traits-description-wysiwyg", null],
  ["actions", "field-actions-description-wysiwyg", null],
  ["bonusActions", "field-bonus-actions-description-wysiwyg", null],
  ["reactions", "field-reactions-description-wysiwyg", null],
  ["characteristics", "field-monster-characteristics-description-wysiwyg", null],
  ["legendary", "field-legendary-actions-description-wysiwyg", "isLegendary"],
  ["mythic", "field-mythic-actions-description-wysiwyg", "isMythic"],
  ["lair", "field-lair-description-wysiwyg", "hasLair"],
];

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
function val(id: string): string {
  const e = byId<HTMLInputElement | HTMLTextAreaElement>(id);
  return e ? (e.value ?? "").trim() : "";
}
function num(id: string, fallback = 10): number {
  const n = parseInt(val(id), 10);
  return Number.isFinite(n) ? n : fallback;
}
function checked(id: string): boolean {
  const e = byId<HTMLInputElement>(id);
  return !!e && e.checked;
}
function selText(id: string): string {
  const e = byId<HTMLSelectElement>(id);
  if (!e || e.selectedIndex < 0) return "";
  return (e.options[e.selectedIndex]?.text ?? "").trim();
}
function selTexts(id: string): string[] {
  const e = byId<HTMLSelectElement>(id);
  if (!e) return [];
  return Array.from(e.selectedOptions).map((o) => o.text.trim()).filter(Boolean);
}
/** Rows of a listing table as arrays of cell text (trailing action cells kept). */
function tableRows(selector: string): string[][] {
  const table = document.querySelector(selector);
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim()),
  );
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `-${Math.abs(n)}`;
}

function composeHitPoints(): string {
  const avg = val(SELECTORS.hpAverage);
  const count = val(SELECTORS.hpDieCount);
  const die = selText(SELECTORS.hpDieValue); // "d8"
  const mod = Number(val(SELECTORS.hpModifier));
  if (!avg && !count) return "";
  const modPart = Number.isFinite(mod) && mod !== 0 ? ` ${mod > 0 ? "+" : "-"} ${Math.abs(mod)}` : "";
  const dice = count && die ? ` (${count}${die}${modPart})` : "";
  return `${avg}${dice}`.trim();
}

function composeInitiative(): string | undefined {
  const raw = val(SELECTORS.initiativeBonus);
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${signed(n)} (${10 + n})`;
}

function composeArmorClass(): string {
  const ac = val(SELECTORS.armorClass);
  const type = val(SELECTORS.armorClassType);
  return type ? `${ac} (${type})` : ac;
}

function composeSpeed(): string {
  return tableRows(SELECTORS.movementTable)
    .map(([type = "", value = ""]) => {
      const v = /ft/i.test(value) ? value : `${value} ft.`;
      return /^walk$/i.test(type) ? v : `${type} ${v}`;
    })
    .join(", ");
}

function composeSenses(): string {
  const senses = tableRows(SELECTORS.senseTable)
    .map(([name = "", value = ""]) => `${name} ${value}`.trim())
    .filter(Boolean)
    .join(", ");
  const pp = val(SELECTORS.passivePerception);
  return [senses, pp ? `Passive Perception ${pp}` : ""].filter(Boolean).join("; ");
}

function readSkills(): Record<string, number> {
  const skills: Record<string, number> = {};
  const rows = tableRows(SELECTORS.skillTable)
    .map(([name = "", bonus = ""]) => [name, Number(bonus)] as const)
    .filter(([name, n]) => name && Number.isFinite(n))
    .sort((a, b) => a[0].localeCompare(b[0])); // DDB lists skills alphabetically
  for (const [name, n] of rows) skills[name] = n;
  return skills;
}

/**
 * Converts D&D Beyond's inline markup embedded in the description HTML into
 * spans showing the visible text:
 *   [rollable]display;{json}[/rollable] → a roll span,
 *   [type]text[/type]  (condition, spells, rules, monsters, items, …) → a
 *   reference span. The interactive roll/link behaviour is a later feature.
 */
function normalizeDdbMarkup(html: string): string {
  return html
    .replace(
      /\[rollable\]([\s\S]*?)(?:;\{[\s\S]*?\})?\[\/rollable\]/g,
      (_all, display: string) => `<span class="roll">${display}</span>`,
    )
    .replace(
      /\[([a-z][\w-]*)\]([\s\S]*?)\[\/\1\]/gi,
      // Most references are just their visible text ([condition]Charmed[/condition]),
      // but some carry a "slug;display" payload (e.g.
      // [rules]shape-shifting;shape-shifts[/rules] reads as "shape-shifts"). The
      // human-readable display is always the last segment.
      (_all, _type: string, inner: string) => {
        const parts = inner.split(";");
        return `<span class="ref">${parts[parts.length - 1]}</span>`;
      },
    )
    // Drop any stray unpaired macro tag (e.g. the unclosed [hover] keyword),
    // which D&D Beyond itself renders as nothing.
    .replace(/ ?\[\/?[a-z][\w-]*\]/gi, "");
}

/** Splits the combined "X - Resistance/Immunity/Vulnerability" multi-select. */
function readDamageAdjustments(): {
  resistances: string;
  immunities: string;
  vulnerabilities: string;
} {
  const res: string[] = [];
  const imm: string[] = [];
  const vul: string[] = [];
  for (const entry of selTexts(SELECTORS.damageAdjustment)) {
    const [name = "", kind = ""] = entry.split(" - ");
    const k = kind.toLowerCase();
    if (k.includes("immun")) imm.push(name.trim());
    else if (k.includes("vulner")) vul.push(name.trim());
    else res.push(name.trim());
  }
  return { resistances: res.join(", "), immunities: imm.join(", "), vulnerabilities: vul.join(", ") };
}

function readSavingThrows(
  abilities: Monster["abilities"],
  pb: number,
): Partial<Record<Ability, number>> {
  const saves: Partial<Record<Ability, number>> = {};
  for (const abbr of selTexts(SELECTORS.savingThrows)) {
    const a = ABBREV_TO_ABILITY[abbr.toUpperCase()];
    if (!a) continue;
    const override = val(`field-${ABILITY_FIELD[a]}-save-bonus`);
    const overrideNum = Number(override);
    saves[a] =
      override !== "" && Number.isFinite(overrideNum)
        ? overrideNum
        : abilityModifier(abilities[a]) + pb;
  }
  return saves;
}

/** The monster's artwork URL, if an avatar has been uploaded (large preferred). */
function readImage(): string | undefined {
  const img = document.querySelector<HTMLImageElement>(
    ".ddb-homebrew-create-form-fields-item-large-avatar img, .ddb-homebrew-create-form-fields-item-avatar img",
  );
  const src = img?.src ?? "";
  return src && !/gravatar|placeholder|blank|thumbnails\/0\b/i.test(src) ? src : undefined;
}

function readDescriptions(): Partial<Record<SectionKey, string>> {
  const out: Partial<Record<SectionKey, string>> = {};
  for (const [key, textareaId, flag] of SECTION_TEXTAREA) {
    if (flag && !checked(SELECTORS[flag])) continue;
    const html = val(textareaId);
    if (html) out[key] = normalizeDdbMarkup(html);
  }
  return out;
}

export class DdbMonsterAdapter implements PageAdapter {
  readonly kind = "monster" as const;

  matches(): boolean {
    return URL_PATTERN.test(location.pathname) || !!document.querySelector(SELECTORS.formRoot);
  }

  read(): Monster | null {
    if (!document.querySelector(SELECTORS.formRoot)) return null;

    const m = emptyMonster();
    m.ruleset = byId<HTMLSelectElement>(SELECTORS.ruleset)?.value === "1" ? "5.5e" : "5e";
    m.name = val(SELECTORS.name) || m.name;
    m.image = readImage();

    const abilities = {
      str: num(`field-${ABILITY_FIELD.str}`),
      dex: num(`field-${ABILITY_FIELD.dex}`),
      con: num(`field-${ABILITY_FIELD.con}`),
      int: num(`field-${ABILITY_FIELD.int}`),
      wis: num(`field-${ABILITY_FIELD.wis}`),
      cha: num(`field-${ABILITY_FIELD.cha}`),
    };
    m.abilities = abilities;

    m.challengeRating = selText(SELECTORS.challengeRating) || m.challengeRating;
    const pb = proficiencyForCr(m.challengeRating);

    // Meta: size/type/alignment come from selects whose text can be free-form
    // ("Medium or Small"), so compose the exact line rather than the size enum.
    const size = selText(SELECTORS.size);
    const type = selText(SELECTORS.monsterType);
    const subType = selText(SELECTORS.subType);
    const alignment = selText(SELECTORS.alignment);
    m.type = subType && !/^choose/i.test(subType) ? `${type} (${subType})` : type;
    m.alignment = alignment;
    m.metaOverride =
      [size, m.type].filter(Boolean).join(" ") + (alignment ? `, ${alignment}` : "");

    m.armorClass = composeArmorClass();
    m.initiative = composeInitiative();
    m.hitPoints = composeHitPoints() || m.hitPoints;
    m.speed = composeSpeed();
    m.savingThrows = readSavingThrows(abilities, pb);
    m.skills = readSkills();

    const dmg = readDamageAdjustments();
    m.damageResistances = dmg.resistances;
    m.damageImmunities = dmg.immunities;
    m.damageVulnerabilities = dmg.vulnerabilities;
    m.conditionImmunities = selTexts(SELECTORS.conditionImmunity).join(", ");

    m.senses = composeSenses();
    m.languages = val(SELECTORS.languages);
    m.gear = val(SELECTORS.gear);

    m.descriptionHtml = readDescriptions();
    // Structured arrays stay empty; the renderers use descriptionHtml.
    return m;
  }

  write(_monster: Monster): void {
    // Full write-back is a later feature; setRuleset is the first field wired.
  }

  setRuleset(ruleset: Ruleset): void {
    const select = byId<HTMLSelectElement>(SELECTORS.ruleset);
    if (!select) return;
    select.value = ruleset === "5.5e" ? "1" : "0";
    // Dispatch the events DDB's form listeners expect.
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  setAbility(ability: Ability, score: number): void {
    const input = byId<HTMLInputElement>(`field-${ABILITY_FIELD[ability]}`);
    if (!input) return;
    input.value = String(score);
    // Same pattern as setRuleset: DDB's form has no derived-recompute to fight,
    // so a bubbling input+change is enough for observe() to re-read.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  observe(onChange: () => void): () => void {
    const root = document.querySelector(SELECTORS.formRoot) ?? document.body;
    const observer = new MutationObserver(() => onChange());
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    const onInput = () => onChange();
    root.addEventListener("input", onInput, true);
    root.addEventListener("change", onInput, true);
    return () => {
      observer.disconnect();
      root.removeEventListener("input", onInput, true);
      root.removeEventListener("change", onInput, true);
    };
  }
}
