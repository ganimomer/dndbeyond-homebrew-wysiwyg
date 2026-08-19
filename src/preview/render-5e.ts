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
import { nameRow } from "./name-row.js";
import { expandInline } from "./inline.js";
import { sectionBody } from "./sections.js";
import { metaContent } from "./meta.js";
import {
  hiddenFields,
  isVisible,
  tidbitFields,
  visibleMeta,
  type RenderOptions,
} from "./optional-fields.js";
import { addFieldButton } from "./tags.js";
import { speedChips } from "./speed-line.js";
import { hitPointsChip } from "./hit-points-line.js";
import { armorClassChip } from "./armor-class-line.js";

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

export function render5e(monster: Monster, options: RenderOptions = {}): HTMLElement {
  const { revealed } = options;
  const root = el("div", "statblock v5e");

  // Name through tidbits is one section: a reader sees a single block of basic
  // information, not a header plus attributes plus abilities plus tidbits. The
  // tapered rules are separators *within* it, so they stay inline.
  const basics = el("section", "basics");
  basics.append(nameRow(monster));

  const metaNodes = metaContent(monster, visibleMeta(monster, revealed));
  if (metaNodes.length) {
    const meta = el("div", "meta");
    meta.append(...metaNodes);
    basics.append(meta);
  }

  basics.append(el("hr", "rule"));

  const acLine = labeled("Armor Class", armorClassChip(monster));
  acLine.dataset.dep = "dex";
  basics.append(acLine);
  const hpLine = labeled("Hit Points", hitPointsChip(monster));
  hpLine.dataset.dep = "con";
  basics.append(hpLine);
  basics.append(labeled("Speed", speedChips(monster)));

  basics.append(el("hr", "rule"));

  const abilityBlock = el("div", "ability-block");
  for (const a of ABILITIES) abilityBlock.append(abilityCell(a, monster));
  basics.append(abilityBlock);

  basics.append(el("hr", "rule"));

  // Tidbits, in the 2014 block's order and under its longer labels. A field the
  // creature has no value for isn't printed — the "Add…" menu below brings it back.
  for (const spec of tidbitFields("5e")) {
    if (!isVisible(spec, monster, revealed)) continue;
    const line = labeled(spec.label ?? "", spec.render(monster));
    line.dataset.row = spec.key;
    if (spec.dep) line.dataset.dep = spec.dep;
    basics.append(line);
  }
  basics.append(labeled("Challenge", challengeText(monster)));
  basics.append(labeled("Proficiency Bonus", formatModifier(proficiencyBonus(monster))));

  if (hiddenFields(monster, revealed, "5e").length) basics.append(addFieldButton());
  root.append(basics);

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
