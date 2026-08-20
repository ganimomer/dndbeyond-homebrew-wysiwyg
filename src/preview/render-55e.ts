/**
 * Renders a monster in D&D Beyond's 5.5e layout ("mon-stat-block-2024"):
 * Initiative on the AC line, two Mod/Save ability tables, short tidbit labels,
 * and small-caps section headings. Class names live under `.statblock.v55e`
 * (see statblock-55e.css). Structure mirrors the real page's DOM.
 */
import {
  ABILITY_ABBREV,
  type Ability,
  type Monster,
  type NamedEntry,
  type SectionKey,
} from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  initiativeText,
  proficiencyBonus,
  saveBonus,
  xpForCr,
} from "../statblock/compute.js";
import { el, saveSlot, scoreInput } from "./dom.js";
import { makeIcon } from "./icons.js";
import { expandInline } from "./inline.js";
import { sectionBody } from "./sections.js";
import {
  hiddenFields,
  isVisible,
  tidbitFields,
  visibleMeta,
  type RenderOptions,
} from "./optional-fields.js";
import { nameRow } from "./name-row.js";
import { addFieldButton } from "./tags.js";
import { island } from "./island.js";
import { hitPointsChip } from "./hit-points-line.js";
import { armorClassChip } from "./armor-class-line.js";

function inline(text: string): DocumentFragment {
  return expandInline(text, el, "roll");
}

/** A "Label value" line used for both attributes and tidbits. */
function labeled(label: string, value: string | Node): HTMLElement {
  const line = el("div", "line");
  const labelEl = el("span", "label");
  labelEl.textContent = label;
  line.append(labelEl, " ");
  line.append(typeof value === "string" ? inline(value) : value);
  return line;
}

/**
 * A Save cell: a character-sheet proficiency dot plus the bonus, the whole thing
 * one button that `wireSavingThrows` toggles.
 *
 * The number lives in its own `[data-save]` span rather than on the cell,
 * because `wireAbilityInputs` live-updates it by assigning `textContent` — on
 * the cell that would wipe the icon out.
 */
function saveToggle(ability: Ability, monster: Monster): HTMLButtonElement {
  const proficient = monster.savingThrows[ability] !== undefined;
  const button = el("button", "save-toggle");
  button.type = "button";
  button.dataset.saveToggle = ability;
  button.setAttribute("aria-pressed", String(proficient));
  button.setAttribute(
    "aria-label",
    `${ABILITY_ABBREV[ability]} saving throw proficiency`,
  );

  const value = el("span");
  value.dataset.save = ability;
  value.textContent = formatModifier(saveBonus(monster, ability));

  button.append(makeIcon(proficient ? "circle" : "radioButtonUnchecked", 13), value);
  return button;
}

function abilityTable(kind: "physical" | "mental", abilities: Ability[], monster: Monster): HTMLTableElement {
  const table = el("table", `stat-table ${kind}`);

  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th"), el("th"));
  const modTh = el("th");
  modTh.textContent = "Mod";
  const saveTh = el("th");
  saveTh.textContent = "Save";
  headRow.append(modTh, saveTh);
  thead.append(headRow);

  const tbody = el("tbody");
  for (const a of abilities) {
    const row = el("tr");
    const label = el("th");
    label.textContent = ABILITY_ABBREV[a];
    const score = el("td");
    score.append(scoreInput(a, monster.abilities[a], `${ABILITY_ABBREV[a]} score`));
    const mod = el("td", "modifier");
    mod.dataset.mod = a;
    mod.textContent = formatModifier(abilityModifier(monster.abilities[a]));
    const save = el("td", "modifier");
    save.append(saveToggle(a, monster));
    row.append(label, score, mod, save);
    tbody.append(row);
  }

  table.append(thead, tbody);
  return table;
}

function crText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  const pb = formatModifier(proficiencyBonus(monster));
  const xpPart = xp !== undefined ? `XP ${xp.toLocaleString()}; ` : "";
  return `${monster.challengeRating} (${xpPart}PB ${pb})`;
}

function descriptionBlock(
  monster: Monster,
  heading: string,
  key: SectionKey,
  entries?: NamedEntry[],
  intro?: string,
): HTMLElement | null {
  const body = sectionBody(monster, key, entries, intro);
  if (!body) return null;
  const block = el("section", "description-block");
  const head = el("div", "heading");
  head.textContent = heading;
  // The autosave spinner rides the right end of the section's own heading.
  head.append(saveSlot(key));
  block.append(head);
  const content = el("div", "content");
  // Tag the body container so the overlay can locate a section to make editable
  // (the traits editor mounts here, replacing the read-only body).
  content.dataset.section = key;
  content.append(body);
  block.append(content);
  return block;
}

export function render55e(monster: Monster, options: RenderOptions = {}): HTMLElement {
  const { revealed } = options;
  const root = el("div", "statblock v55e");

  // Name through tidbits is one section: a reader sees a single block of basic
  // information, not a header plus attributes plus stats plus tidbits.
  const basics = el("section", "basics");
  basics.append(nameRow(monster));
  if (visibleMeta(monster, revealed).size) {
    const meta = el("div", "meta");
    meta.append(island("meta"));
    basics.append(meta);
  }

  // Attributes: AC (+ Initiative), HP, Speed.
  const acLine = el("div", "line");
  const acLabel = el("span", "label");
  acLabel.textContent = "AC";
  const acValue = el("span", "value");
  acValue.dataset.dep = "dex";
  acValue.append(armorClassChip(monster));
  acLine.append(acLabel, " ", acValue);
  const initLabel = el("span", "label");
  initLabel.textContent = "Initiative";
  const initValue = el("span", "value");
  initValue.dataset.dep = "dex";
  initValue.textContent = initiativeText(monster);
  acLine.append("  ", initLabel, " ", initValue);
  basics.append(acLine);
  const hpLine = labeled("HP", hitPointsChip(monster));
  hpLine.dataset.dep = "con";
  basics.append(hpLine);
  basics.append(labeled("Speed", island("movements")));

  // Ability tables.
  const stats = el("div", "stats");
  stats.append(
    abilityTable("physical", ["str", "dex", "con"], monster),
    abilityTable("mental", ["int", "wis", "cha"], monster),
  );
  basics.append(stats);

  // Tidbits (short labels, canonical 5.5e order). A field the creature has no
  // value for isn't printed at all — the "Add…" menu below brings it back.
  for (const spec of tidbitFields("5.5e")) {
    if (!isVisible(spec, monster, revealed)) continue;
    // Only the meta slots lack a `render`, and they aren't printed as rows.
    if (!spec.render) continue;
    const line = labeled(spec.label ?? "", spec.render(monster));
    line.dataset.row = spec.key;
    if (spec.dep) line.dataset.dep = spec.dep;
    basics.append(line);
  }
  basics.append(labeled("CR", crText(monster)));

  if (hiddenFields(monster, revealed, "5.5e").length) basics.append(addFieldButton());
  root.append(basics);

  // Description blocks.
  const blocks = el("div", "description-blocks");
  const sections: Array<[string, SectionKey, NamedEntry[]?, string?]> = [
    ["Traits", "traits", monster.traits],
    ["Actions", "actions", monster.actions],
    ["Bonus Actions", "bonusActions", monster.bonusActions],
    ["Reactions", "reactions", monster.reactions],
    ["Legendary Actions", "legendary", monster.legendaryActions, monster.legendaryActionsIntro],
    ["Mythic Actions", "mythic"],
    ["Lair Actions", "lair"],
  ];
  for (const [heading, key, entries, intro] of sections) {
    const block = descriptionBlock(monster, heading, key, entries, intro);
    if (block) blocks.append(block);
  }
  root.append(blocks);

  return root;
}
