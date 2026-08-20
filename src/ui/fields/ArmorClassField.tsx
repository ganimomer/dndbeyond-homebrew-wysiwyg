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
 * The one hint is on the total, and only after a Dexterity change: the session
 * remembers what the armor was worth beforehand and offers the class that keeps
 * it worth that, since otherwise a DEX bump quietly reinterprets the creature's
 * armor as being worth less.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ArmorClass, Monster } from "../../statblock/model.js";
import { armorBonus, armorClassText, unarmoredAc } from "../../statblock/armor-class.js";
import { makeIcon } from "../../preview/icons.js";
import { HintChip, IconButton, toInt, useCloseOnOutsideClick } from "../shared/MiniForm.js";

/** The name the hint chip announces itself under. */
const HINT = "armor class";

export interface ArmorClassFieldProps {
  monster: Monster;
  /** Whether Dexterity has been edited this session. */
  dexChanged: boolean;
  /**
   * What the creature's armor was worth before this session's Dexterity edits,
   * or null when there is no reading yet.
   */
  armorBonus: number | null;
  onCommit: (armorClass: ArmorClass) => void;
}

export function ArmorClassField(props: ArmorClassFieldProps) {
  const [open, setOpen] = useState(false);

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
          <span
            ref={(node) => {
              if (node && !node.firstChild) node.append(makeIcon("settings", 14));
            }}
          />
        </button>
      </span>
    );
  }

  return (
    <span class="sb-chips" data-field="armorClass">
      {/* Keyed so re-opening always starts from the creature's stored value
          rather than resuming a draft the user walked away from. */}
      <ArmorClassForm key="form" {...props} onClose={() => setOpen(false)} />
    </span>
  );
}

function ArmorClassForm({
  monster,
  dexChanged,
  armorBonus: previousBonus,
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
   * The class that would keep the armor worth what it was before this session's
   * Dexterity edits, or undefined when there is nothing to offer.
   */
  const suggested =
    dexChanged && previousBonus !== null ? base + previousBonus : undefined;

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
        {suggested !== undefined && suggested !== total ? (
          <HintChip name={HINT} value={suggested} onTake={() => setTotal(suggested)} />
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
