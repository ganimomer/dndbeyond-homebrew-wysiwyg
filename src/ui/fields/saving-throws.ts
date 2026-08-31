/**
 * Turning "this ability is proficient" into what D&D Beyond's form wants.
 *
 * Both layouts drive one multi-select, so every edit commits the *whole* set.
 * DDB labels its options with the same abbreviations the stat block prints,
 * which is what ties an ability to an option value. Unlike skills there is no
 * bonus to write — DDB derives a proficient save as modifier + PB itself.
 *
 * Shared because the two layouts show this completely differently: 5e as a chip
 * row (`SavingThrowsRow`), 5.5e as a proficiency dot in each ability table's
 * Save cell — and the table is still drawn by hand, so `editor/saves-editing.ts`
 * wires those until it isn't.
 */
import type { SelectOption } from "../../adapter/types.js";
import { ABILITY_ABBREV, type Ability } from "../../statblock/model.js";

/** The adapter surface saving throws need (satisfied by PageAdapter). */
export interface SavesAdapter {
  savingThrowOptions(): SelectOption[];
  setSavingThrows(values: string[]): void;
}

export interface SaveCommitter {
  /** DDB's option value for an ability, if it offers one. */
  valueOf(ability: Ability): string | undefined;
  /** Writes the whole set with `ability` added or removed. */
  commit(ability: Ability, proficient: boolean): void;
}

export function saveCommitter(adapter: SavesAdapter): SaveCommitter {
  const options = adapter.savingThrowOptions();
  const byAbbrev = new Map(options.map((o) => [o.text.trim().toUpperCase(), o.value] as const));
  const current = options.filter((o) => o.selected).map((o) => o.value);

  const valueOf = (ability: Ability) => byAbbrev.get(ABILITY_ABBREV[ability]);

  return {
    valueOf,
    commit(ability, proficient) {
      const value = valueOf(ability);
      if (value === undefined) return;
      adapter.setSavingThrows(
        proficient ? [...current, value] : current.filter((v) => v !== value),
      );
    },
  };
}
