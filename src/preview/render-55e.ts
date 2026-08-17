/**
 * Renders a monster in D&D Beyond's 5.5e layout ("mon-stat-block-2024"):
 * Initiative on the AC line, two Mod/Save ability tables, short tidbit labels,
 * and small-caps section headings. Class names live under `.statblock.v55e`
 * (see statblock-55e.css). Structure mirrors the real page's DOM.
 */
import type { Ability, Monster, NamedEntry, SectionKey } from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  initiativeText,
  metaLine,
  proficiencyBonus,
  saveBonus,
  xpForCr,
} from "../statblock/compute.js";
import { el } from "./dom.js";
import { expandInline } from "./inline.js";
import { sectionBody } from "./sections.js";

const ABILITY_LABEL: Record<Ability, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

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
    label.textContent = ABILITY_LABEL[a];
    const score = el("td");
    score.textContent = String(monster.abilities[a]);
    const mod = el("td", "modifier");
    mod.textContent = formatModifier(abilityModifier(monster.abilities[a]));
    const save = el("td", "modifier");
    save.textContent = formatModifier(saveBonus(monster, a));
    row.append(label, score, mod, save);
    tbody.append(row);
  }

  table.append(thead, tbody);
  return table;
}

function skillsText(monster: Monster): string {
  return Object.entries(monster.skills)
    .map(([skill, bonus]) => `${skill} ${formatModifier(bonus)}`)
    .join(", ");
}

function crText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  const pb = formatModifier(proficiencyBonus(monster));
  const xpPart = xp !== undefined ? `XP ${xp.toLocaleString()}; ` : "";
  return `${monster.challengeRating} (${xpPart}PB ${pb})`;
}

function immunitiesText(monster: Monster): string {
  return [monster.damageImmunities, monster.conditionImmunities]
    .filter(Boolean)
    .join("; ");
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
  block.append(head);
  const content = el("div", "content");
  content.append(body);
  block.append(content);
  return block;
}

export function render55e(monster: Monster): HTMLElement {
  const root = el("div", "statblock v55e");

  if (monster.image) {
    const image = el("div", "sb-image");
    const img = el("img");
    img.src = monster.image;
    img.alt = monster.name;
    image.append(img);
    root.append(image);
  }

  const header = el("div", "header");
  const nameRow = el("div", "name-row");
  const name = el("div", "name");
  name.textContent = monster.name || "Unnamed Creature";
  const nameMenu = el("div", "name-menu"); // filled by the editor overlay
  nameRow.append(name, nameMenu);
  const meta = el("div", "meta");
  meta.textContent = metaLine(monster);
  header.append(nameRow, meta);
  root.append(header);

  // Attributes: AC (+ Initiative), HP, Speed.
  const attrs = el("div", "attributes");
  const acLine = el("div", "line");
  const acLabel = el("span", "label");
  acLabel.textContent = "AC";
  const acValue = el("span", "value");
  acValue.textContent = monster.armorClass;
  acLine.append(acLabel, " ", acValue);
  const initLabel = el("span", "label");
  initLabel.textContent = "Initiative";
  const initValue = el("span", "value");
  initValue.textContent = initiativeText(monster);
  acLine.append("  ", initLabel, " ", initValue);
  attrs.append(acLine);
  attrs.append(labeled("HP", monster.hitPoints));
  attrs.append(labeled("Speed", monster.speed));
  root.append(attrs);

  // Ability tables.
  const stats = el("div", "stats");
  stats.append(
    abilityTable("physical", ["str", "dex", "con"], monster),
    abilityTable("mental", ["int", "wis", "cha"], monster),
  );
  root.append(stats);

  // Tidbits (short labels, canonical 5.5e order, empties skipped).
  const tidbits = el("div", "tidbits");
  const skills = skillsText(monster);
  if (skills) tidbits.append(labeled("Skills", skills));
  if (monster.damageVulnerabilities) tidbits.append(labeled("Vulnerabilities", monster.damageVulnerabilities));
  if (monster.damageResistances) tidbits.append(labeled("Resistances", monster.damageResistances));
  const immunities = immunitiesText(monster);
  if (immunities) tidbits.append(labeled("Immunities", immunities));
  if (monster.gear) tidbits.append(labeled("Gear", monster.gear));
  if (monster.senses) tidbits.append(labeled("Senses", monster.senses));
  if (monster.languages) tidbits.append(labeled("Languages", monster.languages));
  tidbits.append(labeled("CR", crText(monster)));
  root.append(tidbits);

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
