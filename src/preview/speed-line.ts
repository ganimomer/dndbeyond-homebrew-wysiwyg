/**
 * The Speed row: a chip per movement type whose distance is edited inline, then
 * a "＋" the editor turns into a menu of the types the creature hasn't got
 * (`wireMovements`).
 *
 * The walking speed prints bare ("40 ft.") the way a stat block does, so its
 * chip carries no label — the ✕ and the input still name it for screen readers.
 * Notes ride along as read-only text: D&D Beyond stores things like "hover"
 * there, and dropping them would quietly change what the creature can do.
 */
import type { Monster, Movement } from "../statblock/model.js";
import { WALK, orderMovements } from "../statblock/movement.js";
import { el } from "./dom.js";
import { addButton, chip } from "./tags.js";

/** The editable distance, tagged so the panel can restore focus to it. */
function speedInput(movement: Movement): HTMLElement {
  const wrap = el("span", "speed-value");

  const input = el("input", "speed-input");
  input.type = "number";
  input.min = "0";
  input.step = "5"; // D&D speeds move in fives
  input.value = String(movement.speed);
  input.dataset.movement = movement.type;
  input.dataset.focusKey = `speed:${movement.type}`;
  input.setAttribute("aria-label", `${movement.type} speed in feet`);

  // No space before the unit: a content-sized number input carries a few px of
  // intrinsic slack after its digits, which is exactly the gap "40 ft." wants.
  wrap.append(input, "ft.");
  if (movement.note) wrap.append(` (${movement.note})`);
  return wrap;
}

export function speedChips(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "movements";

  for (const movement of orderMovements(monster.movements)) {
    const isWalk = movement.type.toLowerCase() === WALK.toLowerCase();
    wrap.append(
      chip({
        value: movement.type,
        label: isWalk ? "" : movement.type,
        detail: speedInput(movement),
        removeLabel: movement.type,
      }),
    );
  }

  const menuHost = el("span", "sb-chip-menu");
  menuHost.append(addButton("Add movement type"));
  wrap.append(menuHost);
  return wrap;
}
