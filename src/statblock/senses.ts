/**
 * Senses, as D&D Beyond's sense table stores them: a type and a free-text note
 * ("120 ft."), one record per row. The note is text rather than a number
 * because DDB's own field is — creatures carry things like
 * "60 ft. (blind beyond this radius)".
 */

/** The sense types DDB offers, in the order its select lists them. */
export const SENSE_TYPES = ["Blindsight", "Darkvision", "Tremorsense", "Truesight"] as const;

/**
 * The range a newly added sense arrives with, so adding one is a click rather
 * than a click and a lookup. These are the values the Monster Manual uses most
 * often for each; when the guess is wrong it's one number to fix.
 */
const DEFAULT_RANGE: Record<string, string> = {
  Blindsight: "30 ft.",
  Darkvision: "60 ft.",
  Tremorsense: "60 ft.",
  Truesight: "120 ft.",
};

export function defaultSenseNote(type: string): string {
  return DEFAULT_RANGE[type] ?? "";
}

/** "Darkvision 120 ft." — the sense as the stat block prints it. */
export function senseText(type: string, note: string): string {
  return note ? `${type} ${note}` : type;
}
