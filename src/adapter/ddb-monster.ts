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
import type { PageAdapter, SelectOption } from "./types.js";
import {
  emptyMonster,
  type Ability,
  type ArmorClass,
  type HitPoints,
  type Monster,
  type Movement,
  type Ruleset,
  type SectionKey,
} from "../statblock/model.js";
import { abilityModifier, proficiencyForCr } from "../statblock/compute.js";
import { ddbToEditorHtml, editorHtmlToDdb } from "../preview/ddb-markup.js";

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

/**
 * DDB's skill ids, from the `#field-skill` select on `/monster/skills/create/<id>`.
 * Hardcoded because the *edit* page has no such select — it only renders the
 * listing table — and the ids are stable. Governing abilities live in
 * `statblock/skills.ts`; these are DOM knowledge, so they stay here.
 */
const SKILL_ID: Record<string, string> = {
  Athletics: "2",
  Acrobatics: "3",
  "Sleight of Hand": "4",
  Stealth: "5",
  Arcana: "6",
  History: "7",
  Investigation: "8",
  Nature: "9",
  Religion: "10",
  "Animal Handling": "11",
  Insight: "12",
  Medicine: "13",
  Perception: "14",
  Survival: "15",
  Deception: "16",
  Intimidation: "17",
  Performance: "18",
  Persuasion: "19",
};

/** DDB's movement ids, from `#field-movement-type` on the create page. */
const MOVEMENT_ID: Record<string, string> = {
  Walk: "1",
  Burrow: "2",
  Climb: "3",
  Fly: "4",
  Swim: "5",
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
/**
 * The `<body>` of the TinyMCE editor backing a description textarea, or null
 * when TinyMCE isn't mounted on it.
 *
 * DDB runs TinyMCE 4 (iframe mode) on every `*-description-wysiwyg` textarea,
 * and its jQuery submit handler calls `tinyMCE.triggerSave()` — which overwrites
 * the textarea from TinyMCE's model. So writing the textarea alone means DDB's
 * own Save button silently reverts our prose. We can't call `tinymce.get()` (the
 * content script is in an isolated world and can't see page globals), but the
 * editor body is same-origin DOM, and TinyMCE's model tracks it: writing there
 * makes both save paths agree. `<id>_ifr` is TinyMCE 4's iframe id convention.
 */
function mceBody(textareaId: string): HTMLElement | null {
  const frame =
    byId<HTMLIFrameElement>(`${textareaId}_ifr`) ??
    byId(`${textareaId}_parent`)?.querySelector("iframe") ??
    null;
  return frame?.contentDocument?.body ?? null;
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
  const option = e.options[e.selectedIndex];
  // DDB's "nothing chosen" option carries an em-dash label with an empty value.
  // That dash is chrome, not data — report it as blank so callers can render
  // their own placeholder rather than a stray "—".
  if (!option || option.value === "") return "";
  return (option.text ?? "").trim();
}
function selTexts(id: string): string[] {
  const e = byId<HTMLSelectElement>(id);
  if (!e) return [];
  return Array.from(e.selectedOptions).map((o) => o.text.trim()).filter(Boolean);
}
/** Every option of a `<select>` as {value, text, selected} — for building a dropdown. */
function selOptions(id: string): SelectOption[] {
  const e = byId<HTMLSelectElement>(id);
  if (!e) return [];
  return Array.from(e.options).map((o) => ({
    value: o.value,
    text: o.text.trim(),
    selected: o.selected,
  }));
}
/**
 * Sets an `<input>`'s value and fires the events DDB's form listeners expect.
 * DDB's form has no derived-recompute to fight, so a bubbling input+change is
 * enough — and it's what `observe()` re-reads on.
 */
function setInput(id: string, value: string): void {
  const input = byId<HTMLInputElement>(id);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
/** Sets a `<select>` to `value` and fires the events DDB's form listeners expect. */
function setSelect(id: string, value: string): void {
  const select = byId<HTMLSelectElement>(id);
  if (!select) return;
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}
/**
 * Selects exactly `values` in a `<select multiple>`. DDB dresses these as Select2
 * widgets, but the underlying select is what the form posts, so setting the
 * options' selection and firing change is enough. (Select2's own chips don't
 * redraw from a programmatic write; the overlay covers them, and a reload
 * reconciles.)
 */
function setMultiSelect(id: string, values: string[]): void {
  const select = byId<HTMLSelectElement>(id);
  if (!select) return;
  const wanted = new Set(values);
  for (const option of Array.from(select.options)) {
    option.selected = wanted.has(option.value);
  }
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
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

/** A field's value as a whole number, 0 when blank or unparseable. */
function intVal(id: string): number {
  const n = parseInt(val(id), 10);
  return Number.isFinite(n) ? n : 0;
}

/** The four hit-point controls, read as the numbers they are. */
function readHitPoints(): HitPoints {
  // The Hit Die select labels its options "d8", not "8".
  const dieValue = parseInt(selText(SELECTORS.hpDieValue).replace(/^d/i, ""), 10);
  return {
    average: intVal(SELECTORS.hpAverage),
    dieCount: intVal(SELECTORS.hpDieCount),
    dieValue: Number.isFinite(dieValue) ? dieValue : 0,
    modifier: intVal(SELECTORS.hpModifier),
  };
}

function composeInitiative(): string | undefined {
  const raw = val(SELECTORS.initiativeBonus);
  if (raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${signed(n)} (${10 + n})`;
}

/** The armor-class number and its free-text qualifier (both plain inputs). */
function readArmorClass(): ArmorClass {
  return { value: intVal(SELECTORS.armorClass), type: val(SELECTORS.armorClassType) };
}

/** Movement rows as `[Type, Speed, Note, actions]`. */
function readMovements(): Movement[] {
  return tableRows(SELECTORS.movementTable)
    .map(([type = "", speed = "", note = ""]) => ({
      type,
      speed: parseInt(speed, 10),
      ...(note ? { note } : {}),
    }))
    .filter((m) => m.type && Number.isFinite(m.speed));
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
  // Columns are [Name, Base Value, Additional Bonus, actions]; the bonus the
  // stat block shows is the two summed (Additional Bonus is usually blank).
  const rows = tableRows(SELECTORS.skillTable)
    .map(([name = "", base = "", extra = ""]) => [name, Number(base) + (Number(extra) || 0)] as const)
    .filter(([name, n]) => name && Number.isFinite(n))
    .sort((a, b) => a[0].localeCompare(b[0])); // DDB lists skills alphabetically
  for (const [name, n] of rows) skills[name] = n;
  return skills;
}

/** One row of a listing table, with the links its actions cell exposes. */
interface ListingRow {
  /** The first cell — the skill's or movement type's name. */
  name: string;
  /** Remaining cell texts, so callers can read e.g. a movement's note. */
  cells: string[];
  editUrl: string;
  deleteUrl: string;
}

/**
 * Rows of a listing table. Skills and movements aren't form fields — each is
 * its own server record, reachable only through the links in its row.
 */
function listingRows(tableSelector: string): ListingRow[] {
  const table = document.querySelector(tableSelector);
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).flatMap((tr) => {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim());
    const href = (suffix: string) =>
      Array.from(tr.querySelectorAll("a")).find((a) =>
        new RegExp(`/${suffix}$`).test(a.getAttribute("href") ?? ""),
      )?.getAttribute("href") ?? "";
    const name = cells[0] ?? "";
    const deleteUrl = href("delete");
    return name && deleteUrl
      ? [{ name, cells, editUrl: href("edit"), deleteUrl }]
      : [];
  });
}

/**
 * The "Add a …" link's target, which carries the monster id we POST to.
 * `path` is DDB's segment for the record type ("skills", "movement").
 */
function createUrl(path: string): string {
  const anchor = document.querySelector<HTMLAnchorElement>(`a[href*="/monster/${path}/create/"]`);
  const href = anchor?.getAttribute("href");
  if (href) return href;
  // Fall back to the id in our own URL if DDB ever drops the link.
  const id = /\/monsters\/(\d+)/.exec(location.pathname)?.[1];
  return id ? `/monster/${path}/create/${id}` : "";
}

function cookie(name: string): string {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

/**
 * The token DDB's own `ajax-post` links send (`Cobalt.Forms.AjaxPostSubmit`):
 * the `RequestVerificationToken` cookie, refreshed when it's missing. The skill
 * *delete* endpoint accepts nothing else — not the form's two tokens, not an
 * XHR header.
 */
async function requestVerificationToken(): Promise<string> {
  const existing = cookie("RequestVerificationToken");
  if (existing) return existing;
  await fetch("/refresh-request-verification-token", { method: "POST", credentials: "include" });
  return cookie("RequestVerificationToken");
}

/**
 * POSTs a urlencoded body and returns the response text.
 *
 * DDB answers a rejected request with `200` and a redirect to `/error` (the
 * same shape as the signed-out redirect to `/sign-in`), so status alone would
 * report a bogus success.
 */
async function postForm(url: string, body: URLSearchParams): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    body,
    credentials: "include",
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`request failed (${response.status})`);
  if (/\/error|sign-in|login/i.test(new URL(response.url).pathname)) {
    throw new Error("request rejected by D&D Beyond");
  }
  return text;
}

/**
 * Submits a listing record's create or edit form and syncs the live table from
 * the response.
 *
 * DDB's own flow navigates to a separate page per row (which is why adding a
 * skill or movement there saves and reloads the monster); we post the same form
 * in place, reusing the edit page's anti-forgery tokens — those are accepted on
 * these endpoints, so no preliminary GET is needed.
 *
 * The response is the whole edit page with the listing already updated, so the
 * fresh `<tbody>` is lifted straight out of it. That's what gives a new row its
 * real id (needed to edit or delete it later) and, because these tables live
 * inside the observed form, what re-renders the stat block. Parsing a ~530 KB
 * response is banned in `save()` — that runs every few seconds — but this is
 * one deliberate click.
 */
async function submitListingForm(
  url: string,
  tableSelector: string,
  fields: Record<string, string>,
): Promise<void> {
  const html = await postForm(
    url,
    new URLSearchParams({
      "security-token": val("field-security-token"),
      "authenticity-token": val("field-authenticity-token"),
      ...fields,
    }),
  );

  const fresh = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector(`${tableSelector} tbody`);
  const live = document.querySelector(`${tableSelector} tbody`);
  if (fresh && live) live.replaceWith(live.ownerDocument.importNode(fresh, true));
}

/**
 * Deletes the named listing row via its own Delete link. The response is a few
 * dozen bytes of JSON rather than a page, so the row is dropped from the live
 * table by hand — which, the table being inside the form, re-renders.
 */
async function deleteListingRow(tableSelector: string, name: string): Promise<void> {
  const row = listingRows(tableSelector).find((r) => r.name === name);
  if (!row) return;

  await postForm(
    row.deleteUrl,
    new URLSearchParams({ "request-verification-token": await requestVerificationToken() }),
  );

  document
    .querySelector(`${tableSelector} tbody`)
    ?.querySelector(`a[href="${row.deleteUrl}"]`)
    ?.closest("tr")
    ?.remove();
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
    // Lossless decode: preserve each roll's JSON and each reference's slug/type
    // (as span data-attributes) so the editor can re-encode them on write-back.
    // The read-only renderer sanitizes these spans down to their class anyway.
    if (html) out[key] = ddbToEditorHtml(html);
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
    // No `|| m.name` fallback: a cleared field is genuinely nameless, and the
    // renderer draws its own prompt. Falling back would show "New Creature" as
    // though the user had typed it.
    m.name = val(SELECTORS.name);
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

    // Meta parts each come from a free-form <select> (size can read "Medium or
    // Small"); the renderer composes them and turns type/subType into dropdowns.
    m.size = selText(SELECTORS.size);
    m.type = selText(SELECTORS.monsterType);
    m.subTypes = selTexts(SELECTORS.subType); // multi-select tag field
    m.alignment = selText(SELECTORS.alignment);

    m.armorClass = readArmorClass();
    m.initiative = composeInitiative();
    m.hitPoints = readHitPoints();
    m.movements = readMovements();
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
    setInput(`field-${ABILITY_FIELD[ability]}`, String(score));
  }

  /** Writes both armor-class controls; autosave persists them. */
  setArmorClass(ac: ArmorClass): void {
    setInput(SELECTORS.armorClass, String(ac.value));
    setInput(SELECTORS.armorClassType, ac.type);
  }

  hitDieOptions(): SelectOption[] {
    return selOptions(SELECTORS.hpDieValue);
  }

  /**
   * Writes all four hit-point controls. Ordinary form fields, so autosave
   * persists them — no per-record endpoint like skills or movements.
   */
  setHitPoints(hp: HitPoints): void {
    setInput(SELECTORS.hpAverage, String(hp.average));
    setInput(SELECTORS.hpDieCount, String(hp.dieCount));
    setInput(SELECTORS.hpModifier, String(hp.modifier));
    // The select's values are DDB's own codes; its labels are "d4".."d20".
    const die = selOptions(SELECTORS.hpDieValue).find((o) => o.text === `d${hp.dieValue}`);
    if (die) setSelect(SELECTORS.hpDieValue, die.value);
  }

  setDescription(section: SectionKey, editorHtml: string): void {
    const entry = SECTION_TEXTAREA.find(([key]) => key === section);
    if (!entry) return;
    const textarea = byId<HTMLTextAreaElement>(entry[1]);
    if (!textarea) return;
    // Re-encode the editor's spans back into DDB's [rollable]/[type] macros.
    const ddbHtml = editorHtmlToDdb(editorHtml);
    textarea.value = ddbHtml;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    // Keep TinyMCE's copy in step, so DDB's own Save can't revert us (see
    // mceBody). Our save() reads the textarea, so this is belt-and-braces —
    // but it's also what keeps the two save paths from disagreeing.
    const body = mceBody(entry[1]);
    if (body) body.innerHTML = ddbHtml;
  }

  /**
   * Persists the form by replaying the POST its Save button would send —
   * `multipart/form-data` to the edit URL — as a `fetch`, so the page never
   * navigates. `FormData` picks up the anti-forgery tokens for free (they're
   * hidden inputs); they rotate per response but DDB accepts stale ones, so
   * there's nothing to patch back.
   *
   * The response is the whole ~530 KB edit page, and we want none of it, so the
   * body is discarded unread. A dead session answers 200 with a redirect to
   * sign-in rather than a 4xx, hence the URL check.
   *
   * Serializing DDB's live form (never our model) is what makes this safe: the
   * payload is byte-for-byte what a native submit sends. The flip side is that
   * an *invalid* monster comes back as 200 with errors rendered into the page,
   * which reads as success here — exactly as it would for DDB's own button.
   */
  async save(): Promise<void> {
    const form = document.querySelector<HTMLFormElement>(SELECTORS.formRoot);
    if (!form) throw new Error("monster form not found");

    const response = await fetch(form.action || location.href, {
      method: "POST",
      body: new FormData(form),
      credentials: "include",
      redirect: "follow",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    void response.body?.cancel();

    if (!response.ok) throw new Error(`save failed (${response.status})`);
    if (/sign-in|login/i.test(response.url)) throw new Error("save failed (signed out)");
  }

  savingThrowOptions(): SelectOption[] {
    // Values are 1..6 = STR..CHA; the labels are the abbreviations we render.
    return selOptions(SELECTORS.savingThrows);
  }

  /**
   * Sets the proficient saves. Same multi-select dance as `setSubTypes` — and
   * deliberately no bonus: DDB derives a proficient save as mod + PB, and
   * `field-<ability>-save-bonus` stays whatever the user typed there.
   */
  setSavingThrows(values: string[]): void {
    setMultiSelect(SELECTORS.savingThrows, values);
  }

  skillOptions(): SelectOption[] {
    const taken = new Set(listingRows(SELECTORS.skillTable).map((r) => r.name));
    return Object.entries(SKILL_ID).map(([text, value]) => ({
      value,
      text,
      selected: taken.has(text),
    }));
  }

  async addSkill(value: string, bonus: number): Promise<void> {
    const url = createUrl("skills");
    if (!url) throw new Error("skill create URL not found");
    await submitListingForm(url, SELECTORS.skillTable, {
      skill: value,
      value: String(bonus),
      "additional-bonus": "",
    });
  }

  async removeSkill(name: string): Promise<void> {
    await deleteListingRow(SELECTORS.skillTable, name);
  }

  movementOptions(): SelectOption[] {
    const taken = new Set(listingRows(SELECTORS.movementTable).map((r) => r.name));
    return Object.entries(MOVEMENT_ID).map(([text, value]) => ({
      value,
      text,
      selected: taken.has(text),
    }));
  }

  async addMovement(value: string, speed: number): Promise<void> {
    const url = createUrl("movement"); // singular, unlike skills
    if (!url) throw new Error("movement create URL not found");
    await submitListingForm(url, SELECTORS.movementTable, {
      "movement-type": value,
      speed: String(speed),
      note: "",
    });
  }

  /**
   * Changes an existing movement's speed. The row's own note rides along
   * unchanged — the edit form posts all three fields, so omitting it would
   * quietly erase things like "hover".
   */
  async setMovementSpeed(type: string, speed: number): Promise<void> {
    const row = listingRows(SELECTORS.movementTable).find((r) => r.name === type);
    if (!row?.editUrl) return;
    const value = MOVEMENT_ID[type];
    if (!value) return;

    await submitListingForm(row.editUrl, SELECTORS.movementTable, {
      "movement-type": value,
      speed: String(speed),
      note: row.cells[2] ?? "",
    });
  }

  async removeMovement(type: string): Promise<void> {
    await deleteListingRow(SELECTORS.movementTable, type);
  }

  setName(name: string): void {
    setInput(SELECTORS.name, name);
  }

  sizeOptions(): SelectOption[] {
    return selOptions(SELECTORS.size);
  }

  typeOptions(): SelectOption[] {
    return selOptions(SELECTORS.monsterType);
  }

  subTypeOptions(): SelectOption[] {
    // The full sub-type tag list (value + label + which are currently chosen).
    return selOptions(SELECTORS.subType);
  }

  alignmentOptions(): SelectOption[] {
    return selOptions(SELECTORS.alignment);
  }

  setSize(value: string): void {
    setSelect(SELECTORS.size, value);
  }

  setType(value: string): void {
    setSelect(SELECTORS.monsterType, value);
  }

  setSubTypes(values: string[]): void {
    setMultiSelect(SELECTORS.subType, values);
  }

  setAlignment(value: string): void {
    setSelect(SELECTORS.alignment, value);
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
