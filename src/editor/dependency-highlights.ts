/**
 * Flags the parts of a stat block that an ability-score change may have
 * invalidated.
 *
 * This spans the whole block rather than any one field — a Dexterity edit
 * reaches the armor class, the initiative, every Dexterity skill and every
 * rollable in the prose — so it is applied to the block as a whole, against the
 * marks the renderers leave:
 *
 *   - `[data-dep~=<ability>|all]` — a value a score change may affect
 *   - `.roll`                     — rollable spans (flagged en masse)
 */
import type { Ability } from "../statblock/model.js";

/**
 * Flags every part of `scope` a change to one of `changed` may have
 * invalidated. No-op until at least one ability has been edited. Saving throws
 * are intentionally not tagged — they recompute on their own.
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
