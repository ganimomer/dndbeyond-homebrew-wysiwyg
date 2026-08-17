/**
 * Dispatches to the stat-block renderer for a monster's ruleset. Callers (the
 * overlay) depend only on this; the 5e/5.5e split lives behind it.
 */
import type { Monster } from "../statblock/model.js";
import { parseChallengeRating } from "../statblock/compute.js";
import { el } from "./dom.js";
import { sectionBody } from "./sections.js";
import { render5e } from "./render-5e.js";
import { render55e } from "./render-55e.js";

/**
 * The monster's free-form characteristics, shown as a plain "Description"
 * section *below* the framed stat block — mirroring D&D Beyond's monster page,
 * where this text sits outside the stat block in ordinary body type.
 */
function renderDescription(monster: Monster): HTMLElement | null {
  const body = sectionBody(monster, "characteristics");
  if (!body) return null;
  const section = el("div", "sb-description");
  const heading = el("h3", "sb-description-heading");
  heading.textContent = "Description";
  const content = el("div", "sb-description-content");
  content.append(body);
  section.append(heading, content);
  return section;
}

/**
 * Builds the full stat-block document for a monster: the framed block in its
 * authored layout, plus the Description section beneath it when present.
 */
export function renderStatBlock(monster: Monster): HTMLElement {
  const block = monster.ruleset === "5e" ? render5e(monster) : render55e(monster);
  const description = renderDescription(monster);
  if (!description) return block;
  const doc = el("div", "sb-doc");
  doc.append(block, description);
  return doc;
}

/** Numeric challenge rating, e.g. for encounter math. */
export function numericCr(monster: Monster): number {
  return parseChallengeRating(monster.challengeRating);
}
