/**
 * Makes the Speed row editable: a ✕ per movement, an inline number for each
 * distance, and a "＋" menu of the types the creature hasn't got.
 *
 * D&D Beyond asks for a type *and* a number, on a separate page, per row. Here
 * the number arrives pre-filled with the speed the creature almost certainly
 * wants (see `defaultSpeed`) and focused, so adding a climb speed is one click
 * and, if the guess is wrong, one number.
 *
 * Like skills — and unlike the ordinary form fields — each of these is a
 * round-trip to DDB that persists on its own, so the row goes `is-busy` while
 * one is in flight.
 */
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";
import { defaultSpeed, movementText } from "../statblock/movement.js";
import { OptionPicker } from "./option-picker.js";
import { commitOnEnter } from "./inline-input.js";

/** The adapter surface the Speed row needs (satisfied by PageAdapter). */
export interface MovementAdapter {
  movementOptions(): SelectOption[];
  addMovement(value: string, speed: number): Promise<void>;
  setMovementSpeed(type: string, speed: number): Promise<void>;
  removeMovement(type: string): Promise<void>;
}

export interface MovementHandlers {
  /** Called with the new movement's type just before it's added, so the panel
   *  can queue focus for the input that's about to appear. */
  onAdd?: (type: string) => void;
  onError?: (error: unknown) => void;
}

export function wireMovements(
  scope: ParentNode,
  monster: Monster,
  adapter: MovementAdapter,
  { onAdd = () => {}, onError = () => {} }: MovementHandlers = {},
): OptionPicker[] {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="movements"]');
  if (!wrap) return [];

  const run = (work: Promise<void>) => {
    wrap.classList.add("is-busy");
    void work.catch((error) => onError(error)).finally(() => wrap.classList.remove("is-busy"));
  };

  for (const btn of wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove")) {
    btn.addEventListener("click", () => {
      const type = btn.closest<HTMLElement>(".sb-chip")?.dataset.value;
      if (type) run(adapter.removeMovement(type));
    });
  }

  // Distances commit on `change` — blur or Enter, never per keystroke — the
  // same rule as the ability scores.
  for (const input of wrap.querySelectorAll<HTMLInputElement>(".speed-input")) {
    const type = input.dataset.movement;
    if (!type) continue;
    const current = monster.movements.find((m) => m.type === type)?.speed;
    commitOnEnter(input);
    input.addEventListener("change", () => {
      const speed = toSpeed(input.value);
      if (speed === null) {
        input.value = String(current ?? 0); // reject junk, show what's stored
        return;
      }
      if (speed === current) return;
      run(adapter.setMovementSpeed(type, speed));
    });
  }

  const host = wrap.querySelector<HTMLElement>(".sb-chip-menu");
  if (!host) return [];

  const taken = new Set(monster.movements.map((m) => m.type));
  const items = adapter
    .movementOptions()
    .filter((option) => !option.selected && !taken.has(option.text))
    .map((option) => {
      const speed = defaultSpeed(monster, option.text);
      return {
        // Show the default this would arrive with, e.g. "Fly 40 ft.".
        label: movementText({ type: option.text, speed }),
        onClick: () => {
          onAdd(option.text);
          run(adapter.addMovement(option.value, speed));
        },
      };
    });

  if (!items.length) {
    // Every movement type is present — keep the chips, drop the affordance.
    host.remove();
    return [];
  }

  const menu = new OptionPicker(items, {
    trigger: { text: "+", ariaLabel: "Add movement type", variant: "add" },
    filterPlaceholder: "Filter movement…",
  });
  host.replaceChildren(menu.element);
  return [menu];
}

/** Coerces the input's text to a non-negative whole number, or null. */
function toSpeed(raw: string): number | null {
  const n = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}
