/**
 * Movement types, their print order, and the defaults that spare the user from
 * typing a number they almost always already know.
 *
 * D&D Beyond's form makes you pick a type *and* enter a speed. Most of the time
 * the answer is obvious: a creature's climb, burrow, fly or swim speed usually
 * matches how fast it walks, and a creature with no walk speed at all is a
 * default 30 ft. walker. So adding a movement fills the value in and lets the
 * user correct it, rather than starting from blank.
 *
 * Rules and presentation knowledge only — the ids DDB uses live in the adapter.
 */
import type { Monster, Movement } from "./model.js";

export const WALK = "Walk";

/** Every movement type DDB offers, in the order its menu should list them. */
export const MOVEMENT_TYPES: readonly string[] = [WALK, "Burrow", "Climb", "Fly", "Swim"];

const isWalk = (type: string) => type.toLowerCase() === WALK.toLowerCase();

/** The creature's walking speed, if it has one. */
export function walkSpeed(monster: Monster): number | undefined {
  return monster.movements.find((m) => isWalk(m.type))?.speed;
}

/**
 * The speed to pre-fill when adding `type`: 30 ft. for a walk speed, and for
 * anything else the creature's own walking speed — falling back to 30 when it
 * hasn't got one.
 */
export function defaultSpeed(monster: Monster, type: string): number {
  if (isWalk(type)) return 30;
  return walkSpeed(monster) ?? 30;
}

/** Walk first, then the rest in DDB's order — the way a stat block prints them. */
export function orderMovements(movements: readonly Movement[]): Movement[] {
  const walk = movements.filter((m) => isWalk(m.type));
  const rest = movements.filter((m) => !isWalk(m.type));
  return [...walk, ...rest];
}

/**
 * How one movement reads in a stat block: the walking speed is printed bare
 * ("40 ft."), everything else is labelled ("Climb 40 ft."), and a note follows
 * in parentheses ("Fly 60 ft. (hover)").
 */
export function movementText(movement: Movement): string {
  const base = isWalk(movement.type)
    ? `${movement.speed} ft.`
    : `${movement.type} ${movement.speed} ft.`;
  return movement.note ? `${base} (${movement.note})` : base;
}
