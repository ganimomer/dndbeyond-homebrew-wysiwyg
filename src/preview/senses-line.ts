/**
 * The Senses row: a chip per sense whose qualifier is edited inline, a "+" the
 * editor turns into a menu of the senses the creature hasn't got, and the
 * passive Perception that closes the line.
 *
 * D&D Beyond keeps senses as listing records (like movement) with a free-text
 * note — "120 ft." — rather than a number, so the note is a text input, not a
 * numeric one. Passive Perception is an ordinary form field and rides along at
 * the end of the row, where the stat block prints it.
 */
import type { Monster, Sense } from "../statblock/model.js";
import { el } from "./dom.js";
import { addButton, chip } from "./tags.js";

/** The editable qualifier, tagged so the panel can restore focus to it. */
function noteInput(sense: Sense): HTMLInputElement {
  const input = el("input", "sense-input");
  input.type = "text";
  input.value = sense.note;
  input.placeholder = "range";
  input.dataset.sense = sense.type;
  input.dataset.focusKey = `sense:${sense.type}`;
  input.setAttribute("aria-label", `${sense.type} range`);
  return input;
}

/** The trailing "Passive Perception 17", its number editable in place. */
function passivePerception(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-passive");
  const input = el("input", "passive-input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.value = monster.passivePerception === undefined ? "" : String(monster.passivePerception);
  input.dataset.focusKey = "passivePerception";
  input.setAttribute("aria-label", "Passive Perception");
  wrap.append("Passive Perception ", input);
  return wrap;
}

/** True when the row has anything to print. */
export function hasSenses(monster: Monster): boolean {
  return monster.senses.length > 0 || monster.passivePerception !== undefined;
}

export function senseChips(monster: Monster): HTMLElement {
  const wrap = el("span", "sb-chips");
  wrap.dataset.field = "senses";

  for (const sense of monster.senses) {
    wrap.append(
      chip({
        value: sense.type,
        label: sense.type,
        detail: noteInput(sense),
        removeLabel: sense.type,
      }),
    );
  }

  const menuHost = el("span", "sb-chip-menu");
  menuHost.append(addButton("Add sense"));
  wrap.append(menuHost);
  wrap.append(passivePerception(monster));
  return wrap;
}
