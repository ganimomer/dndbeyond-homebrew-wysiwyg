/**
 * Renders a monster in D&D Beyond's 5e layout ("mon-stat-block"): tapered
 * separators, a single six-across ability row, and the #822000 accent. Class
 * names live under `.statblock.v5e` (see statblock-5e.css).
 */
import {
  ABILITIES,
  ABILITY_ABBREV,
  type Ability,
  type Monster,
  type NamedEntry,
  type SectionKey,
} from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  xpForCr,
} from "../statblock/compute.js";
import { el, saveSlot, scoreInput } from "./dom.js";
import { expandInline } from "./inline.js";
import { sectionBody } from "./sections.js";
import { metaContent } from "./meta.js";
import { skillsChips } from "./skills-line.js";
import { savingThrowChips } from "./saves-line.js";
import { speedChips } from "./speed-line.js";
import { hitPointsChip } from "./hit-points-line.js";

function inline(text: string): DocumentFragment {
  return expandInline(text, el, "roll");
}

function labeled(label: string, value: string | Node): HTMLElement {
  const line = el("div", "line");
  const labelEl = el("span", "label");
  labelEl.textContent = `${label} `;
  line.append(labelEl, typeof value === "string" ? inline(value) : value);
  return line;
}

function abilityCell(ability: Ability, monster: Monster): HTMLElement {
  const cell = el("div", "stat");
  const heading = el("span", "heading");
  heading.textContent = ABILITY_ABBREV[ability];
  const score = monster.abilities[ability];
  const input = scoreInput(ability, score, `${ABILITY_ABBREV[ability]} score`);
  const modifier = el("span", "modifier");
  const modValue = el("span");
  modValue.dataset.mod = ability;
  modValue.textContent = formatModifier(abilityModifier(score));
  modifier.append("(", modValue, ")");
  cell.append(heading, el("br"), input, document.createTextNode(" "), modifier);
  return cell;
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
  // The autosave spinner rides the right end of the section's own heading.
  h.append(saveSlot(key));
  root.append(h, body);
}

export function render5e(monster: Monster): HTMLElement {
  const root = el("div", "statblock v5e");

  const nameRow = el("div", "name-row");
  const name = el("div", "name");
  name.textContent = monster.name || "Unnamed Creature";
  const nameMenu = el("div", "name-menu"); // filled by the editor overlay
  nameRow.append(name, nameMenu);
  root.append(nameRow);

  const meta = el("div", "meta");
  meta.append(...metaContent(monster));
  root.append(meta);

  root.append(el("hr", "rule"));

  const attrs = el("div", "attributes");
  const acLine = labeled("Armor Class", monster.armorClass);
  acLine.dataset.dep = "dex";
  attrs.append(acLine);
  const hpLine = labeled("Hit Points", hitPointsChip(monster));
  hpLine.dataset.dep = "con";
  attrs.append(hpLine);
  attrs.append(labeled("Speed", speedChips(monster)));
  root.append(attrs);

  root.append(el("hr", "rule"));

  const abilityBlock = el("div", "ability-block");
  for (const a of ABILITIES) abilityBlock.append(abilityCell(a, monster));
  root.append(abilityBlock);

  root.append(el("hr", "rule"));

  const details = el("div", "attributes");
  // Saves and skills always render, even when empty: the "＋" needs a home.
  details.append(labeled("Saving Throws", savingThrowChips(monster)));

  const skillsLine = labeled("Skills", skillsChips(monster));
  skillsLine.dataset.dep = "all";
  details.append(skillsLine);
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
    // Wrap in a tagged container so the overlay can locate the traits body and
    // swap in the editor (mirrors the 5.5e `.content[data-section]` hook).
    const traits = el("div", "content");
    traits.dataset.section = "traits";
    traits.append(traitsBody);
    root.append(traits);
  }

  headedSection(root, monster, "Actions", "actions", monster.actions);
  headedSection(root, monster, "Bonus Actions", "bonusActions", monster.bonusActions);
  headedSection(root, monster, "Reactions", "reactions", monster.reactions);
  headedSection(root, monster, "Legendary Actions", "legendary", monster.legendaryActions, monster.legendaryActionsIntro);
  headedSection(root, monster, "Mythic Actions", "mythic");
  headedSection(root, monster, "Lair Actions", "lair");

  return root;
}
