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
import type { AvatarSize, PageAdapter, SelectOption } from "./types.js";
import {
  emptyMonster,
  type Ability,
  type ArmorClass,
  type HitPoints,
  type Monster,
  type Movement,
  type Ruleset,
  type SectionKey,
  type Sense,
} from "../statblock/model.js";
import { abilityModifier, proficiencyForCr } from "../statblock/compute.js";
import { parseAdjustment } from "../statblock/adjustments.js";
import { ddbToEditorHtml, editorHtmlToDdb } from "../adapter/ddb-markup.js";
import { renamedEditUrl } from "./edit-url.js";
import { listingCollection } from "./ddb-listings.js";

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
  smallAvatar: "field-avatar",
  largeAvatar: "field-large-avatar",
  movementTable: "table.listing-rpgmonster-movement-mapping",
  skillTable: "table.listing-rpgmonster-skill-mapping",
  senseTable: "table.listing-rpgmonster-sense-mapping",
  /** Where DDB renders each avatar it already has, once one is uploaded. */
  largeAvatarPreview: ".ddb-homebrew-create-form-fields-item-large-avatar img",
  smallAvatarPreview: ".ddb-homebrew-create-form-fields-item-avatar img",
} as const;

/** Avatar → the `field-*` id of the file input that uploads it. */
const AVATAR_FIELD: Record<AvatarSize, string> = {
  small: SELECTORS.smallAvatar,
  large: SELECTORS.largeAvatar,
};

/** What the author calls each avatar, for messages about one. */
const AVATAR_LABEL: Record<AvatarSize, string> = {
  small: "Small avatar",
  large: "Large avatar",
};

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

/** DDB's sense ids, from `#field-sense` on `/monster/senses/create/<id>`. */
const SENSE_ID: Record<string, string> = {
  Blindsight: "1",
  Darkvision: "2",
  Tremorsense: "3",
  Truesight: "4",
};

/** DDB's movement ids, from `#field-movement-type` on the create page. */
const MOVEMENT_ID: Record<string, string> = {
  Walk: "1",
  Burrow: "2",
  Climb: "3",
  Fly: "4",
  Swim: "5",
};

/**
 * The three record kinds, and the only things that differ between them: what
 * DDB calls the rows, where it lists them, and what their forms post.
 */
const SKILLS = listingCollection<number>({
  ids: SKILL_ID,
  table: SELECTORS.skillTable,
  createPath: "skills",
  fields: (id, bonus) => ({
    skill: id,
    value: String(bonus),
    "additional-bonus": "",
  }),
});

const MOVEMENTS = listingCollection<number>({
  ids: MOVEMENT_ID,
  table: SELECTORS.movementTable,
  createPath: "movement", // singular, unlike the other two
  fields: (id, speed, existing) => ({
    "movement-type": id,
    speed: String(speed),
    // The row's own note rides along unchanged — the edit form posts all three
    // fields, so omitting it would quietly erase things like "hover".
    note: existing?.cells[2] ?? "",
  }),
});

const SENSES = listingCollection<string>({
  ids: SENSE_ID,
  table: SELECTORS.senseTable,
  createPath: "senses",
  fields: (id, note) => ({ sense: id, "sense-note": note }),
});

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
/**
 * Ticks or unticks a checkbox, and the widget DDB paints over it.
 *
 * The real `<input type="checkbox">` sits inside a `.hide fc-real` wrapper; what
 * the author sees and clicks is a `.fc-fake-item` next to it, which carries
 * `fc-selected` when the box is on. Writing only `.checked` posts correctly but
 * leaves DDB's own form showing the opposite of what we just did.
 */
function setCheckbox(id: string, on: boolean): void {
  const input = byId<HTMLInputElement>(id);
  if (!input) return;
  input.checked = on;
  document.querySelector(`[data-fc-real-item-id="${id}"]`)?.classList.toggle("fc-selected", on);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
/**
 * Greys a gated description in or out, the way D&D Beyond's own form does.
 *
 * Cosmetic, and only for anyone who closes the overlay: DDB greys the editor
 * behind an unticked checkbox, and a greyed editor full of text would read as a
 * bug rather than as our doing. `part` is the middle of the class name, which
 * follows DDB's *label* rather than the section ("legendary-actions", but plain
 * "lair").
 */
function setDescriptionEnabled(part: string, on: boolean): void {
  document
    .querySelector(`.ddb-homebrew-create-form-fields-item-${part}`)
    ?.classList.toggle("disabled", !on);
}

/**
 * The rules an avatar input advertises about what it will take: DDB writes them
 * onto the input itself as `image/png|image/gif|…` and `0..167772160`, and its
 * server enforces them, so this reads them rather than restating them.
 */
function fileRules(input: HTMLInputElement): { types: string[]; maxBytes: number } {
  const types = (input.dataset.validationMimeType ?? "")
    .split("|")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
  const max = Number((input.dataset.validationContentLength ?? "").split("..")[1]);
  return { types, maxBytes: Number.isFinite(max) && max > 0 ? max : Infinity };
}

/** A byte count as the author would write it, for the "too large" message. */
function megabytes(bytes: number): string {
  return `${Math.round((bytes / 1048576) * 10) / 10} MB`;
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

/** Sense rows as `[Name, Note, actions]` — the note is free text ("120 ft."). */
function readSenses(): Sense[] {
  return tableRows(SELECTORS.senseTable)
    .map(([type = "", note = ""]) => ({ type, note }))
    .filter((s) => s.type);
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

/**
 * Points the page at the monster's new URL after a save reslugged it — which is
 * what renaming a creature does, since DDB builds the slug from the name.
 *
 * The form's `action` is a hard-coded slugged path (not document-relative), so
 * it has to be patched alongside the address bar: it, not `location`, is where
 * the next save posts. Left stale, every later autosave would go to a URL the
 * monster no longer has.
 *
 * `replaceState` rather than `pushState` — the user renamed a creature, they
 * didn't navigate, and Back should still lead where it did before. DDB's own
 * router may own `history.state`, so it's carried over untouched.
 */
function followSlugChange(form: HTMLFormElement, responseUrl: string): void {
  const next = renamedEditUrl(location.href, responseUrl);
  if (!next) return;
  history.replaceState(history.state, "", next);
  if (form.getAttribute("action")) form.setAttribute("action", new URL(next).pathname);
}

/** Splits the combined "X - Resistance/Immunity/Vulnerability" multi-select. */
function readDamageAdjustments(): {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
} {
  const res: string[] = [];
  const imm: string[] = [];
  const vul: string[] = [];
  for (const entry of selTexts(SELECTORS.damageAdjustment)) {
    const { name, kind } = parseAdjustment(entry);
    if (kind === "immunity") imm.push(name);
    else if (kind === "vulnerability") vul.push(name);
    else res.push(name);
  }
  return { resistances: res, immunities: imm, vulnerabilities: vul };
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

/** A src that is DDB's "nothing uploaded" chrome rather than a real avatar. */
const NOT_AN_AVATAR = /gravatar|placeholder|blank|thumbnails\/0\b/i;

/**
 * The monster's artwork URL, if an avatar has been uploaded.
 *
 * The large one is the creature's picture and the small one is its icon, so the
 * block wants the large and settles for the small. Two queries rather than one
 * selector list, because a list answers in *document order* — and DDB renders
 * Small Avatar above Large Avatar, so a list would always hand back the icon.
 */
function readImage(): string | undefined {
  for (const selector of [SELECTORS.largeAvatarPreview, SELECTORS.smallAvatarPreview]) {
    const src = document.querySelector<HTMLImageElement>(selector)?.src ?? "";
    if (src && !NOT_AN_AVATAR.test(src)) return src;
  }
  return undefined;
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
    m.conditionImmunities = selTexts(SELECTORS.conditionImmunity);

    m.senses = readSenses();
    const passive = parseInt(val(SELECTORS.passivePerception), 10);
    if (Number.isFinite(passive)) m.passivePerception = passive;
    m.languages = val(SELECTORS.languages);
    m.gear = val(SELECTORS.gear);

    m.isLegendary = checked(SELECTORS.isLegendary);
    m.hasLair = checked(SELECTORS.hasLair);
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

  setLegendary(on: boolean): void {
    setCheckbox(SELECTORS.isLegendary, on);
    setDescriptionEnabled("legendary-actions-description", on);
  }

  setHasLair(on: boolean): void {
    setCheckbox(SELECTORS.hasLair, on);
    // Not "lair-actions-description": DDB's label calls this "Lair and Lair
    // Actions Description" and its class follows the label, not the section.
    setDescriptionEnabled("lair-description", on);
  }

  /**
   * Persists the form by replaying the POST its Save button would send —
   * `multipart/form-data` to the edit URL — as a `fetch`, so the page never
   * navigates. `FormData` picks up the anti-forgery tokens for free (they're
   * hidden inputs); they rotate per response but DDB accepts stale ones, so
   * there's nothing to patch back.
   *
   * The response is the whole ~530 KB edit page, and we want none of it, so the
   * body is discarded unread. Its *URL* earns its keep twice over, though: a
   * dead session answers 200 with a redirect to sign-in rather than a 4xx,
   * hence the check; and the redirect lands on the monster's canonical edit
   * URL, which is how a rename's new slug reaches us (see `followSlugChange`).
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

    followSlugChange(form, response.url);
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
    return SKILLS.options();
  }

  addSkill(value: string, bonus: number): Promise<void> {
    return SKILLS.add(value, bonus);
  }

  removeSkill(name: string): Promise<void> {
    return SKILLS.remove(name);
  }

  movementOptions(): SelectOption[] {
    return MOVEMENTS.options();
  }

  addMovement(value: string, speed: number): Promise<void> {
    return MOVEMENTS.add(value, speed);
  }

  setMovementSpeed(type: string, speed: number): Promise<void> {
    return MOVEMENTS.update(type, speed);
  }

  removeMovement(type: string): Promise<void> {
    return MOVEMENTS.remove(type);
  }

  senseOptions(): SelectOption[] {
    return SENSES.options();
  }

  addSense(value: string, note: string): Promise<void> {
    return SENSES.add(value, note);
  }

  setSenseNote(type: string, note: string): Promise<void> {
    return SENSES.update(type, note);
  }

  removeSense(type: string): Promise<void> {
    return SENSES.remove(type);
  }

  damageAdjustmentOptions(): SelectOption[] {
    return selOptions(SELECTORS.damageAdjustment);
  }

  setDamageAdjustments(values: string[]): void {
    setMultiSelect(SELECTORS.damageAdjustment, values);
  }

  conditionImmunityOptions(): SelectOption[] {
    return selOptions(SELECTORS.conditionImmunity);
  }

  setConditionImmunities(values: string[]): void {
    setMultiSelect(SELECTORS.conditionImmunity, values);
  }

  setPassivePerception(value: number): void {
    setInput(SELECTORS.passivePerception, String(value));
  }

  setGear(text: string): void {
    setInput(SELECTORS.gear, text);
  }

  setLanguages(text: string): void {
    setInput(SELECTORS.languages, text);
  }

  setName(name: string): void {
    setInput(SELECTORS.name, name);
  }

  /**
   * Opens the file picker by clicking DDB's own input. Ours is a *content
   * script*, so that input is ordinary same-document DOM and the click we're
   * standing in is trusted — which is the whole trick: the file lands in the
   * form we already serialize, and `save()` posts it with everything else. No
   * upload endpoint, no token, no `DataTransfer` (which a content script
   * couldn't hand the page anyway).
   */
  chooseAvatar(size: AvatarSize): boolean {
    const input = byId<HTMLInputElement>(AVATAR_FIELD[size]);
    if (!input) return false;
    input.click();
    return true;
  }

  avatarProblem(size: AvatarSize, file: File): string | null {
    const input = byId<HTMLInputElement>(AVATAR_FIELD[size]);
    if (!input) return `${AVATAR_LABEL[size]} upload isn't available`;
    const { types, maxBytes } = fileRules(input);
    // An empty `file.type` means the browser couldn't tell; let the server rule
    // on those rather than refusing something DDB might well accept.
    if (file.type && types.length > 0 && !types.includes(file.type.toLowerCase())) {
      // "WEBP images aren't accepted" — the subtype is the part an author
      // recognizes, and it reads as a sentence where `image/webp` doesn't.
      const kind = file.type.split("/").pop()!.toUpperCase();
      return `${kind} images aren't accepted`;
    }
    if (file.size > maxBytes) return `Image is over ${megabytes(maxBytes)}`;
    return null;
  }

  onAvatarChosen(handler: (size: AvatarSize, file: File) => void): () => void {
    const root = document.querySelector(SELECTORS.formRoot) ?? document.body;
    // Capture, like `observe()`: the same change event DDB's own handlers see,
    // whether the picker was opened from the overlay or from the form itself.
    const onChange = (event: Event) => {
      const input = event.target as HTMLInputElement | null;
      const size = (Object.keys(AVATAR_FIELD) as AvatarSize[]).find(
        (candidate) => AVATAR_FIELD[candidate] === input?.id,
      );
      const file = input?.files?.[0];
      if (size && file) handler(size, file);
    };
    root.addEventListener("change", onChange, true);
    return () => root.removeEventListener("change", onChange, true);
  }

  clearAvatar(size: AvatarSize): void {
    const input = byId<HTMLInputElement>(AVATAR_FIELD[size]);
    if (input) input.value = "";
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
