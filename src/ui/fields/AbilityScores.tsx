/**
 * The ability scores, in whichever shape the layout prints them: 5e's row of
 * six cells with the modifier in parentheses, or 5.5e's two tables with Mod and
 * Save columns.
 *
 * Typing updates the modifier — and the Save derived from it — as you go,
 * without touching the form; the score itself commits on `change`, which is to
 * say on blur or Enter. That split matters: the derived numbers should keep up
 * with what is on screen, but a write-back per keystroke would re-render the
 * whole block underneath the caret.
 *
 * The Save follows the score unless it is a proficient save D&D Beyond has
 * recorded as something other than mod + PB — an override the author set by
 * hand, which we leave alone.
 */
import { useState } from "preact/hooks";
import {
  ABILITIES,
  ABILITY_ABBREV,
  type Ability,
  type Monster,
  type Ruleset,
} from "../../statblock/model.js";
import {
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  saveBonus,
} from "../../statblock/compute.js";
import { Icon } from "../shared/Icon.js";
import { blurOnEnter } from "../shared/inline-input.js";
import { saveCommitter, type SavesAdapter } from "./saving-throws.js";

export interface AbilityScoresProps {
  monster: Monster;
  ruleset: Ruleset;
  adapter: SavesAdapter;
  onCommit: (ability: Ability, score: number) => void;
}

/** Coerces raw input text to a positive integer, or null when unusable. */
function toScore(raw: string): number | null {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** The editable score box, shared by both layouts. */
function ScoreInput({
  ability,
  score,
  onType,
  onCommit,
}: {
  ability: Ability;
  score: number;
  onType: (score: number) => void;
  onCommit: (score: number) => void;
}) {
  return (
    <input
      class="score-input"
      type="number"
      min="1"
      step="1"
      defaultValue={String(score)}
      data-ability={ability}
      data-focus-key={`score:${ability}`}
      aria-label={`${ABILITY_ABBREV[ability]} score`}
      onKeyDown={blurOnEnter}
      onInput={(event) => {
        const next = toScore((event.currentTarget as HTMLInputElement).value);
        if (next !== null) onType(next);
      }}
      onChange={(event) => {
        const box = event.currentTarget as HTMLInputElement;
        const next = toScore(box.value) ?? score;
        box.value = String(next); // normalize what the user sees
        if (next !== score) onCommit(next);
      }}
    />
  );
}

export function AbilityScores({ monster, ruleset, adapter, onCommit }: AbilityScoresProps) {
  /**
   * Scores as they read on screen, which runs ahead of the creature while the
   * user is typing: the modifier and Save have to keep up per keystroke, but
   * the write-back only happens once they are done.
   */
  const [typed, setTyped] = useState<Partial<Record<Ability, number>>>({});
  const scoreOf = (ability: Ability) => typed[ability] ?? monster.abilities[ability];

  const pb = proficiencyBonus(monster);

  /** The Save as it should read for a score of `score`. */
  const saveFor = (ability: Ability, score: number) => {
    const recorded = monster.savingThrows[ability];
    const proficient = recorded !== undefined;
    // An override the author set by hand stays put; anything derived keeps up.
    const isOverride = proficient && recorded !== abilityModifier(monster.abilities[ability]) + pb;
    if (isOverride) return saveBonus(monster, ability);
    const mod = abilityModifier(score);
    return proficient ? mod + pb : mod;
  };

  const score = (ability: Ability) => (
    <ScoreInput
      ability={ability}
      score={monster.abilities[ability]}
      onType={(next) => setTyped({ ...typed, [ability]: next })}
      onCommit={(next) => {
        setTyped({ ...typed, [ability]: undefined });
        onCommit(ability, next);
      }}
    />
  );

  if (ruleset === "5e") {
    return (
      <div class="ability-block">
        {ABILITIES.map((ability) => (
          <div key={ability} class="stat">
            <span class="heading">{ABILITY_ABBREV[ability]}</span>
            <br />
            {score(ability)}{" "}
            <span class="modifier">
              (<span data-mod={ability}>{formatModifier(abilityModifier(scoreOf(ability)))}</span>)
            </span>
          </div>
        ))}
      </div>
    );
  }

  const { commit } = saveCommitter(adapter);

  const table = (kind: "physical" | "mental", abilities: Ability[]) => (
    <table class={`stat-table ${kind}`}>
      <thead>
        <tr>
          <th />
          <th />
          <th>Mod</th>
          <th>Save</th>
        </tr>
      </thead>
      <tbody>
        {abilities.map((ability) => {
          const proficient = monster.savingThrows[ability] !== undefined;
          return (
            <tr key={ability}>
              <th>{ABILITY_ABBREV[ability]}</th>
              <td>{score(ability)}</td>
              <td class="modifier" data-mod={ability}>
                {formatModifier(abilityModifier(scoreOf(ability)))}
              </td>
              <td class="modifier">
                <button
                  type="button"
                  class="save-toggle"
                  data-save-toggle={ability}
                  aria-pressed={proficient ? "true" : "false"}
                  aria-label={`${ABILITY_ABBREV[ability]} saving throw proficiency`}
                  onClick={() => commit(ability, !proficient)}
                >
                  <Icon name={proficient ? "circle" : "radioButtonUnchecked"} size={13} />
                  {/* The number lives in its own span so the icon beside it
                      isn't part of the same text node. */}
                  <span data-save={ability}>{formatModifier(saveFor(ability, scoreOf(ability)))}</span>
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div class="stats">
      {table("physical", ["str", "dex", "con"])}
      {table("mental", ["int", "wis", "cha"])}
    </div>
  );
}
