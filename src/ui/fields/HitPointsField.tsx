/**
 * Hit points: a chip carrying the whole "195 (23d8 + 92)", which opens a form
 * over D&D Beyond's four separate controls — average, die count, die value,
 * modifier — where each field another has invalidated grows a hint chip
 * offering the value it should now hold.
 *
 * Hints rather than rewrites, because the numbers are related but not derived:
 * plenty of stat blocks carry an average someone tuned by hand, and silently
 * recomputing it would be a data loss the author never asked for. So the rule
 * is *offer, don't apply* — nothing changes until the user takes the chip.
 *
 * A hint is only offered for a field the user hasn't reconciled themselves,
 * which is what `baseline` is for: the values as the form opened. A number that
 * still matches its baseline hasn't been touched this session, so a
 * disagreement with it is the author's business, not ours. (Constitution is
 * edited outside this form, so `conChanged` comes in from the session.)
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import type { HitPoints, Monster } from "../../statblock/model.js";
import { abilityModifier } from "../../statblock/compute.js";
import { expectedAverage, expectedModifier, hitPointsText } from "../../statblock/hit-points.js";
import { Icon } from "../shared/Icon.js";
import { HintChip, IconButton, toInt, useCloseOnOutsideClick } from "../shared/MiniForm.js";

/** Which fields are currently offering a better value, and what it is. */
export function hitPointsHints(
  draft: HitPoints,
  baseline: HitPoints,
  conMod: number,
  conChanged: boolean,
): Partial<Record<"average" | "modifier", number>> {
  const hints: Partial<Record<"average" | "modifier", number>> = {};
  if (draft.dieCount <= 0) return hints; // no dice pool to derive anything from

  // The modifier follows Constitution, so it's stale when either side moved.
  const modifier = expectedModifier(draft, conMod);
  if (modifier !== draft.modifier && (conChanged || draft.dieCount !== baseline.dieCount)) {
    hints.modifier = modifier;
  }

  // The average follows the whole pool — including a modifier hint just taken,
  // which is what chains the two together.
  const average = expectedAverage(draft);
  const poolEdited =
    draft.dieCount !== baseline.dieCount ||
    draft.dieValue !== baseline.dieValue ||
    draft.modifier !== baseline.modifier;
  if (average !== draft.average && poolEdited) hints.average = average;

  return hints;
}

export interface HitPointsFieldProps {
  monster: Monster;
  /** Whether Constitution has been edited this session. */
  conChanged: boolean;
  dieOptions: () => SelectOption[];
  onCommit: (hitPoints: HitPoints) => void;
}

export function HitPointsField(props: HitPointsFieldProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <span class="sb-chips" data-field="hitPoints">
        <button
          type="button"
          class="sb-chip sb-chip-button"
          data-focus-key="hp:open"
          aria-label="Edit hit points"
          onClick={() => setOpen(true)}
        >
          <span class="sb-chip-detail">{hitPointsText(props.monster.hitPoints)}</span>
          <Icon name="settings" size={14} />
        </button>
      </span>
    );
  }

  return (
    <span class="sb-chips" data-field="hitPoints">
      {/* Keyed so re-opening starts from the creature's stored values rather
          than resuming a draft the user walked away from. */}
      <HitPointsForm key="form" {...props} onClose={() => setOpen(false)} />
    </span>
  );
}

function HitPointsForm({
  monster,
  conChanged,
  dieOptions,
  onCommit,
  onClose,
}: HitPointsFieldProps & { onClose: () => void }) {
  /** The values as the form opened; gates which hints may appear. */
  const baseline = useRef(monster.hitPoints).current;
  const [draft, setDraft] = useState<HitPoints>({ ...monster.hitPoints });

  const form = useRef<HTMLSpanElement>(null);
  const average = useRef<HTMLInputElement>(null);
  const dieCount = useRef<HTMLInputElement>(null);
  const modifier = useRef<HTMLInputElement>(null);

  /**
   * Which box the edit in flight came from. Taking a hint has to write its
   * field, but the box being typed into is never rewritten — that is what would
   * make the caret jump, and what leaves a half-typed number alone.
   */
  const typing = useRef<string | null>(null);
  useLayoutEffect(() => {
    for (const [name, ref] of [
      ["average", average],
      ["dieCount", dieCount],
      ["modifier", modifier],
    ] as const) {
      if (typing.current !== name && ref.current) ref.current.value = String(draft[name]);
    }
    typing.current = null;
  });

  useLayoutEffect(() => {
    average.current?.focus();
    average.current?.select();
  }, []);

  useCloseOnOutsideClick(form, true, onClose);

  const conMod = abilityModifier(monster.abilities.con);
  const hints = hitPointsHints(draft, baseline, conMod, conChanged);

  const commit = () => {
    onCommit(draft);
    onClose();
  };

  const field = (
    name: "average" | "dieCount" | "modifier",
    ref: typeof average,
    label: string,
  ) => (
    <span class="hp-field">
      <input
        ref={ref}
        class="hp-input"
        type="number"
        step="1"
        min={name === "modifier" ? undefined : "0"}
        data-hp={name}
        data-focus-key={`hp:${name}`}
        aria-label={label}
        defaultValue={String(draft[name])}
        onInput={(event) => {
          typing.current = name;
          setDraft({
            ...draft,
            [name]: toInt((event.currentTarget as HTMLInputElement).value, draft[name]),
          });
        }}
      />
      {name !== "dieCount" && hints[name] !== undefined ? (
        <HintChip
          name={name}
          value={hints[name]!}
          onTake={() => {
            setDraft({ ...draft, [name]: hints[name]! });
            ref.current?.focus();
          }}
        />
      ) : null}
    </span>
  );

  return (
    <span
      class="hp-form"
      ref={form}
      onKeyDown={(event) => {
        // Enter on a hint chip is the browser activating that button; leave it.
        if (event.key === "Enter" && !(event.target as HTMLElement).closest(".sb-hint")) {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {/* Laid out as the stat block reads it: "195 (23d8 + 92)". */}
      {field("average", average, "Average hit points")}(
      {field("dieCount", dieCount, "Number of Hit Dice")}
      <select
        class="hp-die"
        data-hp="dieValue"
        data-focus-key="hp:dieValue"
        aria-label="Hit Die"
        onChange={(event) => {
          // The option's *label* is the die ("d8"); its value is DDB's own code.
          const select = event.currentTarget as HTMLSelectElement;
          const faces = parseInt((select.options[select.selectedIndex]?.text ?? "").replace(/^d/i, ""), 10);
          if (Number.isFinite(faces)) setDraft({ ...draft, dieValue: faces });
        }}
      >
        {dieOptions().map((option) => (
          <option key={option.value} value={option.value} selected={option.text === `d${draft.dieValue}`}>
            {option.text}
          </option>
        ))}
      </select>
      {field("modifier", modifier, "Hit points modifier")})
      <IconButton
        action="cancel"
        icon="close"
        label="Discard hit-point changes"
        onClick={onClose}
      />
      <IconButton action="commit" icon="check" label="Apply hit points" onClick={commit} />
    </span>
  );
}
