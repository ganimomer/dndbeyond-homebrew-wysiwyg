/** Renders a {@link Monster} into a D&D Beyond-style stat block DOM node. */
import { ABILITIES, type Monster, type NamedEntry } from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  parseChallengeRating,
  proficiencyBonus,
  xpForCr,
} from "../statblock/compute.js";

const ABILITY_LABEL: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Expands our lightweight inline markup into DOM. `{...}` marks a special
 * D&D Beyond token (dice, references, links) — for now it renders as a
 * highlighted tag so the placeholders are visible while editing.
 */
function inline(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\{([^}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      frag.append(document.createTextNode(text.slice(last, m.index)));
    }
    const tag = el("span", "tag");
    tag.textContent = m[1];
    frag.append(tag);
    last = re.lastIndex;
  }
  if (last < text.length) {
    frag.append(document.createTextNode(text.slice(last)));
  }
  return frag;
}

function attributeLine(label: string, value: string): HTMLElement {
  const line = el("div", "line");
  const strong = el("span", "label");
  strong.textContent = `${label} `;
  line.append(strong, inline(value));
  return line;
}

function abilityCell(name: string, score: number): HTMLElement {
  const cell = el("div", "ability");
  const nameEl = el("div", "name");
  nameEl.textContent = name;
  const scoreEl = el("div", "score");
  const mod = abilityModifier(score);
  scoreEl.textContent = `${score} (${formatModifier(mod)})`;
  cell.append(nameEl, scoreEl);
  return cell;
}

function entrySection(
  heading: string,
  entries: NamedEntry[],
  intro?: string,
): HTMLElement | null {
  if (entries.length === 0) return null;
  const wrap = document.createDocumentFragment();
  const h = el("h4");
  h.textContent = heading;
  wrap.append(h);
  if (intro) {
    const introEl = el("p", "legendary-intro");
    introEl.append(inline(intro));
    wrap.append(introEl);
  }
  for (const entry of entries) {
    const p = el("p", "entry");
    if (entry.name) {
      const nameEl = el("span", "entry-name");
      nameEl.textContent = `${entry.name}.`;
      p.append(nameEl, " ");
    }
    p.append(inline(entry.text));
    wrap.append(p);
  }
  const container = el("div");
  container.append(wrap);
  return container;
}

function proficiencySkills(monster: Monster): string {
  return Object.entries(monster.skills)
    .map(([skill, bonus]) => `${skill} ${formatModifier(bonus)}`)
    .join(", ");
}

function savingThrows(monster: Monster): string {
  return ABILITIES.filter((a) => monster.savingThrows[a] !== undefined)
    .map((a) => `${ABILITY_LABEL[a]} ${formatModifier(monster.savingThrows[a]!)}`)
    .join(", ");
}

function challengeText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  const pb = proficiencyBonus(monster);
  const xpText = xp !== undefined ? ` (${xp.toLocaleString()} XP` : " (—";
  return `${monster.challengeRating}${xpText}; PB ${formatModifier(pb)})`;
}

/** Builds the stat block element for a monster. */
export function renderStatBlock(monster: Monster): HTMLElement {
  const root = el("div", "statblock");

  const name = el("div", "name");
  name.textContent = monster.name || "Unnamed Creature";
  root.append(name);

  const meta = el("div", "meta");
  const typeLine = [monster.size, monster.type].filter(Boolean).join(" ");
  meta.textContent = `${typeLine}${monster.alignment ? `, ${monster.alignment}` : ""}`;
  root.append(meta);

  root.append(el("hr", "rule"));

  const attrs = el("div", "attributes");
  attrs.append(attributeLine("Armor Class", monster.armorClass));
  attrs.append(attributeLine("Hit Points", monster.hitPoints));
  attrs.append(attributeLine("Speed", monster.speed));
  root.append(attrs);

  root.append(el("hr", "rule"));

  const abilities = el("div", "abilities");
  for (const a of ABILITIES) {
    abilities.append(abilityCell(ABILITY_LABEL[a], monster.abilities[a]));
  }
  root.append(abilities);

  root.append(el("hr", "rule"));

  const details = el("div", "attributes");
  const saves = savingThrows(monster);
  if (saves) details.append(attributeLine("Saving Throws", saves));
  const skills = proficiencySkills(monster);
  if (skills) details.append(attributeLine("Skills", skills));
  if (monster.damageVulnerabilities)
    details.append(attributeLine("Damage Vulnerabilities", monster.damageVulnerabilities));
  if (monster.damageResistances)
    details.append(attributeLine("Damage Resistances", monster.damageResistances));
  if (monster.damageImmunities)
    details.append(attributeLine("Damage Immunities", monster.damageImmunities));
  if (monster.conditionImmunities)
    details.append(attributeLine("Condition Immunities", monster.conditionImmunities));
  if (monster.senses) details.append(attributeLine("Senses", monster.senses));
  if (monster.languages) details.append(attributeLine("Languages", monster.languages));
  details.append(attributeLine("Challenge", challengeText(monster)));
  root.append(details);

  // Ungrouped traits sit directly under the details with no heading.
  if (monster.traits.length > 0) {
    root.append(el("hr", "rule"));
    for (const trait of monster.traits) {
      const p = el("p", "entry");
      if (trait.name) {
        const nameEl = el("span", "entry-name");
        nameEl.textContent = `${trait.name}.`;
        p.append(nameEl, " ");
      }
      p.append(inline(trait.text));
      root.append(p);
    }
  }

  const sections: Array<[string, NamedEntry[], string?]> = [
    ["Actions", monster.actions],
    ["Bonus Actions", monster.bonusActions],
    ["Reactions", monster.reactions],
    ["Legendary Actions", monster.legendaryActions, monster.legendaryActionsIntro],
  ];
  for (const [heading, entries, intro] of sections) {
    const section = entrySection(heading, entries, intro);
    if (section) root.append(section);
  }

  return root;
}

/** Kept for potential callers that want the numeric CR (e.g. encounter math). */
export function numericCr(monster: Monster): number {
  return parseChallengeRating(monster.challengeRating);
}
