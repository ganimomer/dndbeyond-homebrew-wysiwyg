/**
 * The 5.5e ability tables' proficiency dots: each Save cell is a toggle that
 * flips whether that save is proficient.
 *
 * All that is left of this module. The 5e chip row is a component now
 * (`ui/fields/SavingThrowsRow.tsx`); these toggles live inside the ability
 * table, which is still drawn by hand, so they are wired the old way until it
 * is converted too. The mapping onto D&D Beyond's multi-select is shared —
 * see `ui/fields/saving-throws.ts`.
 */
import type { Ability } from "../statblock/model.js";
import { saveCommitter, type SavesAdapter } from "../ui/fields/saving-throws.js";

export type { SavesAdapter };

export function wireSaveToggles(scope: ParentNode, adapter: SavesAdapter): void {
  const { commit } = saveCommitter(adapter);
  for (const button of scope.querySelectorAll<HTMLButtonElement>(".save-toggle")) {
    const ability = button.dataset.saveToggle as Ability | undefined;
    if (!ability) continue;
    const proficient = button.getAttribute("aria-pressed") === "true";
    button.addEventListener("click", () => commit(ability, !proficient));
  }
}
