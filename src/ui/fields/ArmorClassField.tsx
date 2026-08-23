/**
 * Armor class: a chip showing "16 (natural armor)", which opens a form showing
 * the number the way it was actually arrived at —
 *
 *     [ 14 + ] 2  =  [16]  ( [natural armor] )
 *
 * — with the unarmored part (`10 + DEX mod`) as a readonly prefix, the armor's
 * contribution beside it, and the total after the equals sign.
 *
 * The bonus and the total are two views of one stored number, so they are
 * linked both ways and rewrite each other on the spot. That is the opposite of
 * the hit-points form's hint chips, and deliberately so: there the fields are
 * *related but independent* values D&D Beyond stores separately, while here
 * there is only ever one number — the split is a lens on it, not a second fact
 * that could disagree.
 *
 * Two things can leave hints here, and they are not the same shape.
 *
 * A **Dexterity change** leaves one, on the total: the session remembers what
 * the armor was worth beforehand and offers the class that keeps it worth that,
 * since otherwise a DEX bump quietly reinterprets the creature's armor as being
 * worth less.
 *
 * **Replacing the armor in the Gear row** leaves one on every field at once,
 * and taking any of them takes all. That is the one place this form departs
 * from "each field is its own offer", and deliberately: a Dexterity change
 * leaves genuinely independent values to reconcile one at a time, while a new
 * suit of armor is a *single fact* — accepting half of it would leave the block
 * reading "16 (splint)" about a creature in chain mail.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ArmorClass, Monster } from "../../statblock/model.js";
import type { ArmorSuggestion } from "../../state/session.js";
import { armorBonus, armorClassText, unarmoredAc } from "../../statblock/armor-class.js";
import { Icon } from "../shared/Icon.js";
import { HintChip, IconButton, toInt, useCloseOnOutsideClick } from "../shared/MiniForm.js";

/** The names the hint chips announce themselves under. */
const HINT = "armor class";
const BONUS_HINT = "armor bonus";
const TYPE_HINT = "armor type";

export interface ArmorClassFieldProps {
  monster: Monster;
  /** Whether Dexterity has been edited this session. */
  dexChanged: boolean;
  /**
   * What the creature's armor was worth before this session's Dexterity edits,
   * or null when there is no reading yet.
   */
  armorBonus: number | null;
  /**
   * A whole armor class the Gear row is offering, because the author just
   * changed what the creature is wearing. Its arrival opens the form.
   */
  suggestion: ArmorSuggestion | null;
  /** The offer has been answered — taken, or walked away from. */
  onSuggestionDone: () => void;
  onCommit: (armorClass: ArmorClass) => void;
}

export function ArmorClassField(props: ArmorClassFieldProps) {
  const [open, setOpen] = useState(false);

  // An offer arriving from the Gear row opens the form to make it. The author
  // is looking at the armor they just picked; the class it implies belongs on
  // screen beside it, not behind a chip they have to think to click.
  const offered = props.suggestion !== null;
  useLayoutEffect(() => {
    if (offered) setOpen(true);
  }, [offered]);

  /** Closing answers the offer, whichever way the form was left. */
  const close = () => {
    setOpen(false);
    if (offered) props.onSuggestionDone();
  };

  if (!open) {
    return (
      <span class="sb-chips" data-field="armorClass">
        <button
          type="button"
          class="sb-chip sb-chip-button"
          data-focus-key="ac:open"
          aria-label="Edit armor class"
          onClick={() => setOpen(true)}
        >
          <span class="sb-chip-detail">{armorClassText(props.monster.armorClass)}</span>
          <Icon name="settings" size={14} />
        </button>
      </span>
    );
  }

  return (
    <span class="sb-chips" data-field="armorClass">
      {/* Keyed so re-opening always starts from the creature's stored value
          rather than resuming a draft the user walked away from. */}
      <ArmorClassForm key="form" {...props} onClose={close} />
    </span>
  );
}

function ArmorClassForm({
  monster,
  dexChanged,
  armorBonus: previousBonus,
  suggestion,
  onCommit,
  onClose,
}: ArmorClassFieldProps & { onClose: () => void }) {
  const base = unarmoredAc(monster);
  const start = armorBonus(monster.armorClass.value, base);

  /**
   * The sign is kept apart from the magnitude rather than folded into one
   * signed number, because the operator is a field of its own on screen: at a
   * bonus of zero the form still has to remember whether it is showing "14 +"
   * or "14 −".
   */
  const [sign, setSign] = useState<1 | -1>(start < 0 ? -1 : 1);
  const [magnitude, setMagnitude] = useState(Math.abs(start));
  const [type, setType] = useState(monster.armorClass.type);

  const form = useRef<HTMLSpanElement>(null);
  const bonusBox = useRef<HTMLInputElement>(null);
  const valueBox = useRef<HTMLInputElement>(null);

  const total = base + sign * magnitude;
  const draft: ArmorClass = { value: total, type };

  /**
   * Which box the edit in flight came from. The two are two views of one
   * number, so each edit rewrites the other — but never the one being typed
   * into, which is what would make the caret jump.
   */
  const typing = useRef<"bonus" | "value" | null>(null);
  useLayoutEffect(() => {
    if (typing.current !== "bonus" && bonusBox.current) bonusBox.current.value = String(magnitude);
    if (typing.current !== "value" && valueBox.current) valueBox.current.value = String(total);
    typing.current = null;
  });

  // Opening lands in the armor's contribution: it is the half the author is
  // usually reaching for, the other being derived from Dexterity.
  useLayoutEffect(() => {
    bonusBox.current?.focus();
    bonusBox.current?.select();
  }, []);

  useCloseOnOutsideClick(form, true, onClose);

  /** Adopts a total, re-deriving how much of it the armor accounts for. */
  const setTotal = (next: number) => {
    const bonus = armorBonus(next, base);
    setSign(bonus < 0 ? -1 : 1);
    setMagnitude(Math.abs(bonus));
  };

  const commit = () => {
    onCommit(draft);
    onClose();
  };

  /**
   * The class on offer, and where it came from.
   *
   * New armor wins over a Dexterity change when both have something to say: it
   * is the fresher fact, and it is the one that also knows what the parentheses
   * should read. Failing that, the Dexterity offer is the class that would keep
   * the armor worth what it was before this session's edits.
   */
  const offeredValue = suggestion
    ? suggestion.value
    : dexChanged && previousBonus !== null
      ? base + previousBonus
      : undefined;
  /**
   * The armor's half of the offer — and only ever for an armor swap.
   *
   * A Dexterity change deliberately leaves this alone and hints on the total
   * only: there the bonus box is the field the author is already typing in
   * (it takes the focus when the form opens) and the total is the readout, so
   * the offer belongs on the readout. A swap is the other way round — nothing
   * has been typed, and all three fields are being replaced together.
   */
  const offeredBonus = suggestion ? armorBonus(suggestion.value, base) : undefined;

  /**
   * Takes the whole offer.
   *
   * One handler behind every chip, which is what makes accepting one accept all
   * — see this file's header for why an armor swap is a single fact rather than
   * three independent ones. A Dexterity offer has no type to set and so passes
   * through this unchanged.
   */
  const take = () => {
    if (offeredValue !== undefined) setTotal(offeredValue);
    if (suggestion) setType(suggestion.type);
  };

  return (
    <span
      class="ac-form"
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
      <span class="ac-field ac-bonus">
        <span class="ac-prefix">{`${base} ${sign < 0 ? "−" : "+"}`}</span>
        <input
          ref={bonusBox}
          class="ac-input"
          type="number"
          step="1"
          data-ac="bonus"
          data-focus-key="ac:bonus"
          aria-label="Armor bonus"
          defaultValue={String(magnitude)}
          onInput={(event) => {
            typing.current = "bonus";
            const raw = (event.currentTarget as HTMLInputElement).value;
            const next = Math.abs(toInt(raw, magnitude));
            // A minus flips the operator and is absorbed: the field stays a
            // magnitude, so the form can never read "14 − -3". This is also
            // what a number input's step-down at zero produces, which is what
            // makes that flip the prefix too.
            if (raw.includes("-")) {
              setSign(sign < 0 ? 1 : -1);
              setMagnitude(next);
              (event.currentTarget as HTMLInputElement).value = String(next);
              return;
            }
            setMagnitude(next);
          }}
          onKeyDown={(event) => {
            // Stepping walks the *signed* bonus, so the scale stays continuous
            // through zero (…+1, 0, −1, −2…). Left to the browser it would step
            // the magnitude, which runs backwards once the operator is a minus.
            const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = sign * magnitude + step;
            setSign(next < 0 ? -1 : 1);
            setMagnitude(Math.abs(next));
          }}
        />
        {offeredBonus !== undefined && offeredBonus !== sign * magnitude ? (
          <HintChip name={BONUS_HINT} value={offeredBonus} onTake={take} />
        ) : null}
      </span>
      =
      <span class="ac-field">
        <input
          ref={valueBox}
          class="ac-input"
          type="number"
          step="1"
          data-ac="value"
          data-focus-key="ac:value"
          aria-label="Armor class"
          defaultValue={String(total)}
          onInput={(event) => {
            typing.current = "value";
            setTotal(toInt((event.currentTarget as HTMLInputElement).value, total));
          }}
        />
        {offeredValue !== undefined && offeredValue !== total ? (
          <HintChip name={HINT} value={offeredValue} onTake={take} />
        ) : null}
      </span>
      (
      <input
        class="ac-type"
        data-ac="type"
        data-focus-key="ac:type"
        placeholder="armor type"
        aria-label="Armor type"
        value={type}
        onInput={(event) => setType((event.currentTarget as HTMLInputElement).value)}
      />
      {suggestion && suggestion.type !== type ? (
        <HintChip name={TYPE_HINT} value={suggestion.type} onTake={take} />
      ) : null}
      )
      <IconButton
        action="cancel"
        icon="close"
        label="Discard armor-class changes"
        onClick={onClose}
      />
      <IconButton action="commit" icon="check" label="Apply armor class" onClick={commit} />
    </span>
  );
}
