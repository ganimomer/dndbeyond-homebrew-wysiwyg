/**
 * The stat block's top line: the creature's name, and the overlay's own
 * controls beside it — the save indicator, the ruleset switch, and the close
 * button.
 *
 * The name is the block's; the rest is the editor's, and sits here because this
 * is where D&D Beyond's own monster page puts its actions menu.
 */
import type { MenuItem } from "./shared/ContextMenu.js";
import type { Monster } from "../statblock/model.js";
import { addLair } from "../state/lair.js";
import { makeLegendary } from "../state/legendary.js";
import { useEditing, useStore } from "./store-context.js";
import { ContextMenu } from "./shared/ContextMenu.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { HEADER_ORIGIN } from "../editor/save-indicator.js";
import { NameField } from "./fields/NameField.js";
import { CloseButton } from "./shared/CloseButton.js";

export function NameRow({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const editing = useEditing();
  const store = useStore();
  // Offer only the layout we're not currently in.
  const other = monster.ruleset === "5e" ? "5.5e" : "5e";

  const items: MenuItem[] = [
    {
      label: `Use ${other} stat block`,
      icon: "loop",
      onClick: () => editing.setRuleset(other),
    },
  ];
  // Only one way in: once the creature is legendary, the crown chip in the meta
  // row is where its status lives, and the chip's ✕ is how it comes off.
  if (!monster.isLegendary) {
    items.push({
      label: "Make legendary",
      icon: "crown",
      onClick: () => void makeLegendary(store),
    });
  }
  if (!monster.hasLair) {
    items.push({ label: "Add lair", icon: "castle", onClick: () => void addLair(store) });
  }

  return (
    <div class="name-row">
      <NameField name={monster.name} onCommit={(name) => editing.setName(name)} />
      <div class="name-menu">
        {/* The top-area save indicator sits at the row's right end, immediately
            before the context menu. */}
        <SaveSlot origin={HEADER_ORIGIN} />
        <ContextMenu items={items} />
        {onClose ? <CloseButton onClick={onClose} /> : null}
      </div>
    </div>
  );
}
