/**
 * A chip in the meta row standing for something D&D Beyond keeps in a checkbox.
 *
 * Legendary status and a lair have no other home on the block: DDB holds each
 * as a tickbox, and a tickbox is not something a stat block has. A chip is —
 * every other value on the block wears one, and its ✕ already means "take this
 * off the creature". The only difference here is what comes off with it, which
 * is why these ask first.
 *
 * The wording is the caller's, because only the caller knows what its own
 * removal reaches into. What lives here is the shape they share: the glyph, the
 * ✕, and the rule that nothing to lose means no question asked.
 */
import { useState } from "preact/hooks";
import type { IconName } from "../shared/icons.js";
import { Chip } from "../shared/Chip.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";
import { Icon } from "../shared/Icon.js";

export interface StatusChipProps {
  icon: IconName;
  /** The word on the chip, and what its ✕ is named after. */
  label: string;
  /** The dialog's question, asked only when there is something to lose. */
  title: string;
  /**
   * What removing this would take with it, each already worded as a noun
   * phrase. Falsy entries drop out, so a caller can pass a condition straight
   * in; an empty list means the chip comes off without a question.
   */
  casualties: readonly (string | false | null | undefined)[];
  onRemove: () => void;
}

export function StatusChip({ icon, label, title, casualties, onRemove }: StatusChipProps) {
  const [confirming, setConfirming] = useState(false);
  const losing = casualties.filter((entry): entry is string => !!entry);
  const name = label.toLowerCase();
  const remove = () => {
    setConfirming(false);
    onRemove();
  };

  return (
    <span class="status-chip" data-status={name}>
      <Chip
        value={name}
        label={
          <>
            <Icon name={icon} size={14} /> {label}
          </>
        }
        removeLabel={name}
        onRemove={() => (losing.length ? setConfirming(true) : remove())}
      />
      {confirming ? (
        <ConfirmDialog
          title={title}
          confirmLabel="Remove"
          onConfirm={remove}
          onCancel={() => setConfirming(false)}
        >
          {`This also removes ${losing.join(" and ")}.`}
        </ConfirmDialog>
      ) : null}
    </span>
  );
}
