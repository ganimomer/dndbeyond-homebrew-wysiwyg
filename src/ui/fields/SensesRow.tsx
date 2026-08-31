/**
 * The Senses row: a chip per sense whose range is edited in place, a "＋"
 * offering the senses the creature hasn't got, and the passive Perception that
 * closes the line.
 *
 * D&D Beyond keeps senses as listing records with a free-text note — "120 ft."
 * rather than a number, because creatures carry things like "60 ft. (blind
 * beyond this radius)" — so each add, edit and removal is its own round-trip
 * and the row freezes while one is out. Passive Perception is the odd one out:
 * an ordinary form field that happens to be printed on the same line.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import type { Monster, Sense } from "../../statblock/model.js";
import { defaultSenseNote, senseText } from "../../statblock/senses.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";
import { blurOnEnter, useSyncedValue } from "../shared/inline-input.js";

/** The adapter surface the Senses row needs (satisfied by PageAdapter). */
export interface SenseAdapter {
  senseOptions(): SelectOption[];
  addSense(value: string, note: string): Promise<void>;
  setSenseNote(type: string, note: string): Promise<void>;
  removeSense(type: string): Promise<void>;
  setPassivePerception(value: number): void;
}

export interface SensesRowProps {
  monster: Monster;
  adapter: SenseAdapter;
  autoOpen?: boolean;
  onError?: (error: unknown) => void;
}

/** One sense, with its range edited in place. */
function SenseChip({
  sense,
  focusOnMount,
  onCommit,
  onRemove,
}: {
  sense: Sense;
  /** The sense was just added: land in its range, ready to type over. */
  focusOnMount: boolean;
  onCommit: (note: string) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useSyncedValue(input, sense.note);

  // A layout effect: the caret has to be in the box before the browser paints,
  // or the user sees it land somewhere else first.
  useLayoutEffect(() => {
    if (!focusOnMount) return;
    input.current?.focus();
    input.current?.select();
  }, [focusOnMount]);

  return (
    <Chip
      value={sense.type}
      label={sense.type}
      removeLabel={sense.type}
      onRemove={onRemove}
      detail={
        <input
          ref={input}
          class="sense-input"
          type="text"
          defaultValue={sense.note}
          placeholder="range"
          data-sense={sense.type}
          data-focus-key={`sense:${sense.type}`}
          aria-label={`${sense.type} range`}
          onKeyDown={blurOnEnter}
          onChange={(event) => {
            const note = (event.currentTarget as HTMLInputElement).value.trim();
            if (note === sense.note) return;
            onCommit(note);
          }}
        />
      }
    />
  );
}

export function SensesRow({ monster, adapter, autoOpen = false, onError }: SensesRowProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(autoOpen);
  /**
   * The sense we just asked D&D Beyond to add. Once it comes back on the
   * creature, its range gets the caret — adding a sense is always a prelude to
   * saying how far it reaches.
   */
  const [added, setAdded] = useState<string | null>(null);
  const passive = useRef<HTMLInputElement>(null);
  const passiveText = monster.passivePerception === undefined ? "" : String(monster.passivePerception);
  useSyncedValue(passive, passiveText);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const run = (work: Promise<void>) => {
    setBusy(true);
    void work.catch((error) => onError?.(error)).finally(() => setBusy(false));
  };

  const taken = new Set(monster.senses.map((s) => s.type));
  const items = adapter
    .senseOptions()
    .filter((option) => !option.selected && !taken.has(option.text))
    .map((option) => {
      const note = defaultSenseNote(option.text);
      return {
        // Show the default this would arrive with, e.g. "Darkvision 60 ft.".
        label: senseText(option.text, note),
        onClick: () => {
          setAdded(option.text);
          run(adapter.addSense(option.value, note));
        },
      };
    });

  return (
    <span class={busy ? "sb-chips is-busy" : "sb-chips"} data-field="senses">
      {monster.senses.map((sense) => (
        <SenseChip
          key={sense.type}
          sense={sense}
          focusOnMount={added === sense.type}
          onCommit={(note) => run(adapter.setSenseNote(sense.type, note))}
          onRemove={() => run(adapter.removeSense(sense.type))}
        />
      ))}
      {items.length > 0 ? (
        <span class="sb-chip-menu">
          <OptionPicker
            options={items}
            trigger={{ text: "+", ariaLabel: "Add sense", variant: "add" }}
            filterPlaceholder="Filter senses…"
            focusKey="add:senses"
            open={open}
            onOpenChange={setOpen}
          />
        </span>
      ) : null}
      <span class="sb-passive">
        {"Passive Perception "}
        <input
          ref={passive}
          class="passive-input"
          type="number"
          min="0"
          step="1"
          defaultValue={passiveText}
          data-focus-key="passivePerception"
          aria-label="Passive Perception"
          onKeyDown={blurOnEnter}
          onChange={(event) => {
            const input = event.currentTarget as HTMLInputElement;
            const value = Math.round(Number(input.value));
            if (input.value.trim() === "" || !Number.isFinite(value) || value < 0) {
              // Reject junk, show what's stored.
              input.value = passiveText;
              return;
            }
            if (value === monster.passivePerception) return;
            adapter.setPassivePerception(value);
          }}
        />
      </span>
    </span>
  );
}
