/**
 * Makes the Senses row editable: a ✕ per sense, its range edited in place, a
 * "+" menu of the senses the creature hasn't got, and the passive Perception
 * that closes the row.
 *
 * Senses are listing records like movements — each add, edit and removal is its
 * own round-trip to D&D Beyond that persists on its own, so the row goes
 * `is-busy` while one is in flight. Passive Perception is the odd one out: an
 * ordinary form field, committed synchronously and left to autosave.
 */
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";
import { defaultSenseNote, senseText } from "../statblock/senses.js";
import { ContextMenu } from "./context-menu.js";
import { commitOnEnter } from "./inline-input.js";

/** The adapter surface the Senses row needs (satisfied by PageAdapter). */
export interface SenseAdapter {
  senseOptions(): SelectOption[];
  addSense(value: string, note: string): Promise<void>;
  setSenseNote(type: string, note: string): Promise<void>;
  removeSense(type: string): Promise<void>;
  setPassivePerception(value: number): void;
}

export interface SenseHandlers {
  /** Called with the new sense's type just before it's added, so the panel can
   *  queue focus for the range that's about to appear. */
  onAdd?: (type: string) => void;
  /** Called after passive Perception is written, to request an autosave. */
  onPassivePerception?: () => void;
  onError?: (error: unknown) => void;
}

export function wireSenses(
  scope: ParentNode,
  monster: Monster,
  adapter: SenseAdapter,
  { onAdd = () => {}, onPassivePerception = () => {}, onError = () => {} }: SenseHandlers = {},
): ContextMenu[] {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="senses"]');
  if (!wrap) return [];

  const run = (work: Promise<void>) => {
    wrap.classList.add("is-busy");
    void work.catch((error) => onError(error)).finally(() => wrap.classList.remove("is-busy"));
  };

  for (const button of wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove")) {
    button.addEventListener("click", () => {
      const type = button.closest<HTMLElement>(".sb-chip")?.dataset.value;
      if (type) run(adapter.removeSense(type));
    });
  }

  // Ranges commit on `change` — blur or Enter, never per keystroke.
  for (const input of wrap.querySelectorAll<HTMLInputElement>(".sense-input")) {
    const type = input.dataset.sense;
    if (!type) continue;
    const current = monster.senses.find((s) => s.type === type)?.note;
    commitOnEnter(input);
    input.addEventListener("change", () => {
      const note = input.value.trim();
      if (note === current) return;
      run(adapter.setSenseNote(type, note));
    });
  }

  // Passive Perception is a plain form field sharing the row.
  const passive = wrap.querySelector<HTMLInputElement>(".passive-input");
  if (passive) {
    commitOnEnter(passive);
    passive.addEventListener("change", () => {
      const value = Math.round(Number(passive.value));
      if (passive.value.trim() === "" || !Number.isFinite(value) || value < 0) {
        // Reject junk, show what's stored.
        passive.value = monster.passivePerception === undefined ? "" : String(monster.passivePerception);
        return;
      }
      if (value === monster.passivePerception) return;
      adapter.setPassivePerception(value);
      onPassivePerception();
    });
  }

  const host = wrap.querySelector<HTMLElement>(".sb-chip-menu");
  if (!host) return [];

  const taken = new Set(monster.senses.map((s) => s.type));
  const items = adapter
    .senseOptions()
    .filter((option) => !option.selected && !taken.has(option.text))
    .map((option) => {
      const note = defaultSenseNote(option.text);
      return {
        // Show the default this would arrive with, e.g. "Darkvision 60 ft.".
        label: senseText(option.text, note),
        onClick: () => {
          onAdd(option.text);
          run(adapter.addSense(option.value, note));
        },
      };
    });

  if (!items.length) {
    host.remove();
    return [];
  }

  const menu = new ContextMenu(items, {
    triggerText: "+",
    triggerLabel: "Add sense",
    triggerClass: "inline",
    menuClass: "compact",
  });
  host.replaceChildren(menu.element);
  return [menu];
}
