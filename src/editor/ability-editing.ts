/**
 * Turns the ability-score inputs the renderers emit into live editors, and
 * flags the parts of a stat block that a score change may have invalidated.
 *
 * The renderers mark elements so this module can wire behavior without knowing
 * either layout:
 *   - `input.score-input[data-ability]`  — the editable score
 *   - `[data-mod=<ability>]`             — that ability's modifier cell
 *   - `[data-save=<ability>]`            — that ability's Save cell (5.5e)
 *   - `[data-dep~=<ability>|all]`        — a value a score change may affect
 *   - `.roll`                            — rollable spans (flagged en masse)
 */
import type { Ability, Monster } from "../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  proficiencyBonus,
} from "../statblock/compute.js";

/** Coerces raw input text to a positive integer, or null when unusable. */
function toScore(raw: string): number | null {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Wires each `.score-input` in `scope`. Typing updates the ability's own
 * modifier (and derived Save) live without touching the form; committing (blur
 * or Enter) clamps to a positive integer and, when it actually changed, calls
 * `onCommit` to write it back.
 */
export function wireAbilityInputs(
  scope: ParentNode,
  monster: Monster,
  onCommit: (ability: Ability, score: number) => void,
): void {
  const pb = proficiencyBonus(monster);

  for (const input of scope.querySelectorAll<HTMLInputElement>(".score-input")) {
    const ability = input.dataset.ability as Ability | undefined;
    if (!ability) continue;

    const current = monster.abilities[ability];
    // The Save follows the score unless it's a proficient save that was
    // overridden to something other than mod+PB — then we leave it fixed. A
    // non-proficient save is just the modifier; a proficient one adds PB
    // (mirroring saveBonus() in compute.ts).
    const recorded = monster.savingThrows[ability];
    const proficient = recorded !== undefined;
    const isOverride = proficient && recorded !== abilityModifier(current) + pb;

    input.addEventListener("input", () => {
      const score = toScore(input.value);
      if (score === null) return;
      const mod = abilityModifier(score);
      const modCell = scope.querySelector(`[data-mod="${ability}"]`);
      if (modCell) modCell.textContent = formatModifier(mod);
      if (!isOverride) {
        const saveCell = scope.querySelector(`[data-save="${ability}"]`);
        if (saveCell) saveCell.textContent = formatModifier(proficient ? mod + pb : mod);
      }
    });

    input.addEventListener("change", () => {
      const score = toScore(input.value) ?? current;
      input.value = String(score); // normalize what the user sees
      if (score !== current) onCommit(ability, score);
    });
  }
}

/**
 * Flags every part of `scope` a change to one of `changed` may have invalidated:
 * dependency-tagged values (`[data-dep]`) and all rollable spans. No-op until at
 * least one ability has been edited. Saving throws are intentionally not tagged
 * — they recompute on their own.
 */
export function applyDependencyHighlights(
  scope: ParentNode,
  changed: ReadonlySet<Ability>,
): void {
  if (changed.size === 0) return;

  for (const elm of scope.querySelectorAll<HTMLElement>("[data-dep]")) {
    const deps = (elm.dataset.dep ?? "").split(/\s+/);
    if (deps.includes("all") || deps.some((d) => changed.has(d as Ability))) {
      elm.classList.add("needs-review");
    }
  }
  for (const roll of scope.querySelectorAll(".roll")) {
    roll.classList.add("needs-review");
  }
}
