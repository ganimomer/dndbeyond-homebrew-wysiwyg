/**
 * Adapter for D&D Beyond's homebrew *monster* creation page.
 *
 * ⚠️ The selectors below are placeholders. The live page is behind auth and
 * rendered client-side, so they need to be captured from a real session and
 * filled in. Everything the rest of the extension needs is expressed through
 * {@link SELECTORS} and the three small helpers, so wiring the real page is a
 * localized change — no editor or preview code has to move.
 */
import type { PageAdapter } from "./types.js";
import { emptyMonster, type Monster } from "../statblock/model.js";
import { sampleMonster } from "../statblock/sample.js";

/**
 * Every DOM hook the monster adapter needs, in one place. Replace each value
 * with the real selector discovered on the live page.
 *
 * TODO(page-wiring): capture these from the DDB homebrew monster editor.
 */
export const SELECTORS = {
  /** A stable element that only exists on the monster creation/edit form. */
  formRoot: '[data-testid="monster-builder"], form.homebrew-monster',
  name: 'input[name="name"]',
  size: 'select[name="size"]',
  type: 'input[name="type"], select[name="type"]',
  alignment: 'input[name="alignment"], select[name="alignment"]',
  armorClass: 'input[name="armorClass"]',
  hitPoints: 'input[name="hitPoints"]',
  speed: 'input[name="speed"]',
  challengeRating: 'select[name="challengeRating"], input[name="challengeRating"]',
  // Ability scores keyed by our ability id.
  abilities: {
    str: 'input[name="str"]',
    dex: 'input[name="dex"]',
    con: 'input[name="con"]',
    int: 'input[name="int"]',
    wis: 'input[name="wis"]',
    cha: 'input[name="cha"]',
  },
} as const;

/** URL shape of the monster builder. Refine once we've seen the real path. */
const URL_PATTERN = /\/homebrew\/(creations|collection)\/.*monster/i;

function readInput(selector: string): string | null {
  const node = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  return node ? node.value : null;
}

export class DdbMonsterAdapter implements PageAdapter {
  readonly kind = "monster" as const;

  matches(): boolean {
    if (URL_PATTERN.test(location.pathname)) return true;
    // Fall back to a structural check so we still attach if the URL differs.
    return document.querySelector(SELECTORS.formRoot) !== null;
  }

  read(): Monster | null {
    const root = document.querySelector(SELECTORS.formRoot);
    if (!root) {
      // Page not ready — or selectors not yet wired. Fall back to a sample so
      // the preview has something to render during scaffolding.
      return sampleMonster();
    }

    const monster = emptyMonster();
    monster.name = readInput(SELECTORS.name) ?? monster.name;
    monster.size = (readInput(SELECTORS.size) as Monster["size"]) ?? monster.size;
    monster.type = readInput(SELECTORS.type) ?? monster.type;
    monster.alignment = readInput(SELECTORS.alignment) ?? monster.alignment;
    monster.armorClass = readInput(SELECTORS.armorClass) ?? monster.armorClass;
    monster.hitPoints = readInput(SELECTORS.hitPoints) ?? monster.hitPoints;
    monster.speed = readInput(SELECTORS.speed) ?? monster.speed;
    monster.challengeRating =
      readInput(SELECTORS.challengeRating) ?? monster.challengeRating;

    for (const [ability, selector] of Object.entries(SELECTORS.abilities)) {
      const raw = readInput(selector);
      if (raw !== null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          monster.abilities[ability as keyof Monster["abilities"]] = n;
        }
      }
    }

    // TODO(page-wiring): traits/actions/reactions live in repeating field
    // groups on DDB — parse those once we can see their structure.
    return monster;
  }

  write(_monster: Monster): void {
    // TODO(page-wiring): push model values back into DDB's inputs and dispatch
    // the input/change events its React state expects. No-op until selectors
    // are real, so we never clobber the user's form with placeholder data.
  }

  observe(onChange: () => void): () => void {
    const root = document.querySelector(SELECTORS.formRoot) ?? document.body;
    const observer = new MutationObserver(() => onChange());
    observer.observe(root, { subtree: true, childList: true, attributes: true });

    const onInput = () => onChange();
    root.addEventListener("input", onInput, true);

    return () => {
      observer.disconnect();
      root.removeEventListener("input", onInput, true);
    };
  }
}
