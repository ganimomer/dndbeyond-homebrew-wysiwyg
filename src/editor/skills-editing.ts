/**
 * Turns the Skills row's chips (emitted by `skillsChips`) into a live editor:
 * a ✕ on each skill removes it, and the trailing "＋" opens a menu of the
 * skills the creature doesn't have yet, each showing the bonus we'd write.
 *
 * The point of the menu labels is that D&D Beyond makes you work the bonus out
 * yourself; we know the ability modifier and the proficiency bonus, so we
 * compute it and write it for you.
 *
 * Unlike every other edit, these don't go through autosave: DDB stores skills
 * as separate records with their own endpoints, so the adapter's calls persist
 * on their own. They're also slow enough to need feedback, hence `is-busy`.
 */
import type { SelectOption } from "../adapter/types.js";
import { ABILITY_ABBREV, type Monster } from "../statblock/model.js";
import { formatModifier } from "../statblock/compute.js";
import { SKILL_ABILITY, skillBonus } from "../statblock/skills.js";
import { ContextMenu } from "./context-menu.js";

/** The adapter surface the skills row needs (satisfied by PageAdapter). */
export interface SkillsAdapter {
  skillOptions(): SelectOption[];
  addSkill(value: string, bonus: number): Promise<void>;
  removeSkill(name: string): Promise<void>;
}

/**
 * Wires the row in `scope`. Returns the menu it created (if any) so the panel
 * can detach its listeners when the next render replaces the block.
 */
export function wireSkills(
  scope: ParentNode,
  monster: Monster,
  adapter: SkillsAdapter,
  onError: (error: unknown) => void = () => {},
): ContextMenu[] {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="skills"]');
  if (!wrap) return [];

  // A skill write is a round-trip to DDB; freeze the row meanwhile so a second
  // click can't race the first. The row is rebuilt by the re-render that the
  // adapter's table update triggers, so success needs no cleanup here.
  const run = (work: Promise<void>) => {
    wrap.classList.add("is-busy");
    void work.catch((error) => onError(error)).finally(() => wrap.classList.remove("is-busy"));
  };

  for (const btn of wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove")) {
    btn.addEventListener("click", () => {
      const name = btn.closest<HTMLElement>(".sb-chip")?.dataset.value;
      if (name) run(adapter.removeSkill(name));
    });
  }

  const host = wrap.querySelector<HTMLElement>(".sb-chip-menu");
  if (!host) return [];

  const items = adapter
    .skillOptions()
    .filter((option) => !option.selected)
    .map((option) => {
      // Skills outside the standard table have no governing ability to derive
      // from, so they go in unadorned at +0 rather than guessing.
      const bonus = skillBonus(monster, option.text);
      const ability = SKILL_ABILITY[option.text];
      const label =
        bonus === undefined || !ability
          ? option.text
          : `${option.text} (${ABILITY_ABBREV[ability]}) ${formatModifier(bonus)}`;
      return { label, onClick: () => run(adapter.addSkill(option.value, bonus ?? 0)) };
    });

  if (!items.length) {
    // Every skill is taken — leave the chips, drop the affordance.
    host.remove();
    return [];
  }

  const menu = new ContextMenu(items, {
    triggerText: "+",
    triggerLabel: "Add skill",
    triggerClass: "inline",
    menuClass: "compact",
  });
  host.replaceChildren(menu.element);
  return [menu];
}
