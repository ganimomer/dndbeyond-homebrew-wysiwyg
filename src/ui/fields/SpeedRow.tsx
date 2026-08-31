/**
 * The Speed row: a chip per movement type whose distance is edited inline, and
 * a "＋" offering the types the creature hasn't got.
 *
 * The walking speed prints bare ("40 ft.") the way a stat block does, so its
 * chip carries no label — the ✕ and the input still name it for screen readers.
 * Notes ride along as read-only text: D&D Beyond stores things like "hover"
 * there, and dropping them would quietly change what the creature can do.
 *
 * D&D Beyond asks for a type *and* a number, on a separate page, per row. Here
 * the number arrives pre-filled with the speed the creature almost certainly
 * wants and holding the caret, so adding a climb speed is one click and, if the
 * guess is wrong, one number. Like senses, each edit is its own round-trip.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import type { Monster, Movement } from "../../statblock/model.js";
import { WALK, defaultSpeed, movementText, orderMovements } from "../../statblock/movement.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";
import { blurOnEnter, useSyncedValue } from "../shared/inline-input.js";

/** The adapter surface the Speed row needs (satisfied by PageAdapter). */
export interface MovementAdapter {
  movementOptions(): SelectOption[];
  addMovement(value: string, speed: number): Promise<void>;
  setMovementSpeed(type: string, speed: number): Promise<void>;
  removeMovement(type: string): Promise<void>;
}

export interface SpeedRowProps {
  monster: Monster;
  adapter: MovementAdapter;
  onError?: (error: unknown) => void;
}

/** Coerces the input's text to a non-negative whole number, or null. */
function toSpeed(raw: string): number | null {
  const n = Math.round(Number(raw));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** One movement type, with its distance edited in place. */
function MovementChip({
  movement,
  focusOnMount,
  onCommit,
  onRemove,
}: {
  movement: Movement;
  focusOnMount: boolean;
  onCommit: (speed: number) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useSyncedValue(input, String(movement.speed));

  // The default is selected as well as focused, so typing replaces it.
  useLayoutEffect(() => {
    if (!focusOnMount) return;
    input.current?.focus();
    input.current?.select();
  }, [focusOnMount]);

  const isWalk = movement.type.toLowerCase() === WALK.toLowerCase();

  return (
    <Chip
      value={movement.type}
      label={isWalk ? "" : movement.type}
      removeLabel={movement.type}
      onRemove={onRemove}
      detail={
        <span class="speed-value">
          <input
            ref={input}
            class="speed-input"
            type="number"
            min="0"
            step="5" // D&D speeds move in fives
            defaultValue={String(movement.speed)}
            data-movement={movement.type}
            data-focus-key={`speed:${movement.type}`}
            aria-label={`${movement.type} speed in feet`}
            onKeyDown={blurOnEnter}
            onChange={(event) => {
              const box = event.currentTarget as HTMLInputElement;
              const speed = toSpeed(box.value);
              if (speed === null) {
                box.value = String(movement.speed); // reject junk, show what's stored
                return;
              }
              if (speed === movement.speed) return;
              onCommit(speed);
            }}
          />
          {/* No space before the unit: a content-sized number input carries a
              few px of intrinsic slack after its digits, which is exactly the
              gap "40 ft." wants. */}
          ft.
          {movement.note ? ` (${movement.note})` : null}
        </span>
      }
    />
  );
}

export function SpeedRow({ monster, adapter, onError }: SpeedRowProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  /** The type we just asked DDB to add; its distance gets the caret. */
  const [added, setAdded] = useState<string | null>(null);

  const run = (work: Promise<void>) => {
    setBusy(true);
    void work.catch((error) => onError?.(error)).finally(() => setBusy(false));
  };

  const taken = new Set(monster.movements.map((m) => m.type));
  const items = adapter
    .movementOptions()
    .filter((option) => !option.selected && !taken.has(option.text))
    .map((option) => {
      const speed = defaultSpeed(monster, option.text);
      return {
        // Show the default this would arrive with, e.g. "Fly 40 ft.".
        label: movementText({ type: option.text, speed }),
        onClick: () => {
          setAdded(option.text);
          run(adapter.addMovement(option.value, speed));
        },
      };
    });

  return (
    <span class={busy ? "sb-chips is-busy" : "sb-chips"} data-field="movements">
      {orderMovements(monster.movements).map((movement) => (
        <MovementChip
          key={movement.type}
          movement={movement}
          focusOnMount={added === movement.type}
          onCommit={(speed) => run(adapter.setMovementSpeed(movement.type, speed))}
          onRemove={() => run(adapter.removeMovement(movement.type))}
        />
      ))}
      {/* Every movement type is present — keep the chips, drop the affordance. */}
      {items.length > 0 ? (
        <span class="sb-chip-menu">
          <OptionPicker
            options={items}
            trigger={{ text: "+", ariaLabel: "Add movement type", variant: "add" }}
            filterPlaceholder="Filter movement…"
            open={open}
            onOpenChange={setOpen}
          />
        </span>
      ) : null}
    </span>
  );
}
