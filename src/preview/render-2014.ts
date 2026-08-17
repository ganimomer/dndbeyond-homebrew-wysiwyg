/**
 * Renders a monster in D&D Beyond's 2014 layout ("mon-stat-block"): tapered
 * separators, a single six-across ability row, and the #822000 accent. Class
 * names live under `.statblock.v2014` (see statblock-2014.css).
 */
import {
  ABILITIES,
  type Ability,
  type Monster,
  type NamedEntry,
  type SectionKey,
} from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
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

function labeled(label: string, value: string): HTMLElement {
  const line = el("div", "line");
  const labelEl = el("span", "label");
  labelEl.textContent = `${label} `;
  line.append(labelEl, inline(value));
  return line;
}

function abilityCell(ability: Ability, monster: Monster): HTMLElement {
  const cell = el("div", "stat");
  const heading = el("span", "heading");
  heading.textContent = ABILITY_LABEL[ability];
  const score = monster.abilities[ability];
  const modifier = el("span", "modifier");
  modifier.textContent = `(${formatModifier(abilityModifier(score))})`;
  cell.append(heading, el("br"), document.createTextNode(`${score} `), modifier);
  return cell;
}

function savingThrowsText(monster: Monster): string {
  return ABILITIES.filter((a) => monster.savingThrows[a] !== undefined)
    .map((a) => `${ABILITY_LABEL[a]} ${formatModifier(saveBonus(monster, a))}`)
    .join(", ");
}

function skillsText(monster: Monster): string {
  return Object.entries(monster.skills)
    .map(([skill, bonus]) => `${skill} ${formatModifier(bonus)}`)
    .join(", ");
}

function challengeText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  return xp !== undefined
    ? `${monster.challengeRating} (${xp.toLocaleString()} XP)`
    : monster.challengeRating;
}

function headedSection(
  root: HTMLElement,
  monster: Monster,
  heading: string,
  key: SectionKey,
  entries?: NamedEntry[],
  intro?: string,
): void {
  const body = sectionBody(monster, key, entries, intro);
  if (!body) return;
  const h = el("h4");
  h.textContent = heading;
  root.append(h, body);
}

export function render2014(monster: Monster): HTMLElement {
  const root = el("div", "statblock v2014");

  const name = el("div", "name");
  name.textContent = monster.name || "Unnamed Creature";
  root.append(name);

  const meta = el("div", "meta");
  meta.textContent = metaLine(monster);
  root.append(meta);

  root.append(el("hr", "rule"));

  const attrs = el("div", "attributes");
  attrs.append(labeled("Armor Class", monster.armorClass));
  attrs.append(labeled("Hit Points", monster.hitPoints));
  attrs.append(labeled("Speed", monster.speed));
  root.append(attrs);

  root.append(el("hr", "rule"));

  const abilityBlock = el("div", "ability-block");
  for (const a of ABILITIES) abilityBlock.append(abilityCell(a, monster));
  root.append(abilityBlock);

  root.append(el("hr", "rule"));

  const details = el("div", "attributes");
  const saves = savingThrowsText(monster);
  if (saves) details.append(labeled("Saving Throws", saves));
  const skills = skillsText(monster);
  if (skills) details.append(labeled("Skills", skills));
  if (monster.damageVulnerabilities) details.append(labeled("Damage Vulnerabilities", monster.damageVulnerabilities));
  if (monster.damageResistances) details.append(labeled("Damage Resistances", monster.damageResistances));
  if (monster.damageImmunities) details.append(labeled("Damage Immunities", monster.damageImmunities));
  if (monster.conditionImmunities) details.append(labeled("Condition Immunities", monster.conditionImmunities));
  if (monster.senses) details.append(labeled("Senses", monster.senses));
  if (monster.languages) details.append(labeled("Languages", monster.languages));
  details.append(labeled("Challenge", challengeText(monster)));
  details.append(labeled("Proficiency Bonus", formatModifier(proficiencyBonus(monster))));
  root.append(details);

  const traitsBody = sectionBody(monster, "traits", monster.traits);
  if (traitsBody) {
    root.append(el("hr", "rule"));
    root.append(traitsBody);
  }

  headedSection(root, monster, "Actions", "actions", monster.actions);
  headedSection(root, monster, "Bonus Actions", "bonusActions", monster.bonusActions);
  headedSection(root, monster, "Reactions", "reactions", monster.reactions);
  headedSection(root, monster, "Characteristics", "characteristics");
  headedSection(root, monster, "Legendary Actions", "legendary", monster.legendaryActions, monster.legendaryActionsIntro);
  headedSection(root, monster, "Mythic Actions", "mythic");
  headedSection(root, monster, "Lair Actions", "lair");

  return root;
}
