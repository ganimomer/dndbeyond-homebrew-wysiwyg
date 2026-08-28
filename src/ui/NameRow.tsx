/**
 * The stat block's top line: the creature's name, and the overlay's own
 * controls beside it — the save indicator, the ruleset switch, and the close
 * button.
 *
 * The name is the block's; the rest is the editor's, and sits here because this
 * is where D&D Beyond's own monster page puts its actions menu.
 *
 * The row is pinned to the top of the window (see NameRow.css), which is what
 * lets that menu carry things an author reaches for part-way down a long
 * creature — "Add section…" among them.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MenuEntry } from "./shared/ContextMenu.js";
import type { Monster } from "../statblock/model.js";
import { addLair } from "../state/lair.js";
import { makeLegendary } from "../state/legendary.js";
import { useEditing, useSession, useStore } from "./store-context.js";
import { ContextMenu } from "./shared/ContextMenu.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { HEADER_ORIGIN } from "../editor/save-indicator.js";
import { NameField } from "./fields/NameField.js";
import { CloseButton } from "./shared/CloseButton.js";
import { useSaveState } from "./shared/use-save-state.js";
import { isDirty } from "../editor/autosave.js";
import { detailsUrl } from "../adapter/edit-url.js";
import { useCompare } from "./compare/compare-context.js";
import { addSectionEntry } from "./prose/add-section-item.js";

/** Why "Go to details page" is greyed out. */
const UNSAVED_NOTE =
  "Waiting for your last edits to save — the details page would still show the old version.";

/**
 * Whether the row is currently pinned to the top of the window.
 *
 * It is the same paper colour as the block scrolling beneath it, so once it
 * pins it needs an edge or the text appears to vanish at an invisible line.
 * The row watches itself: with the root inset by a pixel it stops intersecting
 * *fully* at exactly the moment it comes to rest against the top. No sentinel
 * element, and `root: null` is right because the overlay is fixed to the
 * viewport, so its scrollport and the viewport are the same box.
 */
function useStuck() {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(entry.intersectionRatio < 1),
      { rootMargin: "-1px 0px 0px 0px", threshold: 1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, pinned };
}

export function NameRow({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const editing = useEditing();
  const store = useStore();
  const session = useSession();
  const compare = useCompare();
  const stuck = useStuck();
  const unsaved = isDirty(useSaveState());
  // Offer only the layout we're not currently in.
  const other = monster.ruleset === "5e" ? "5.5e" : "5e";

  const items: MenuEntry[] = [
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
  // Last of the three that give the creature a part it hadn't got, and the only
  // one of them with a choice to make, so it is the one that opens a flyout.
  const addSection = addSectionEntry(monster, session, store);
  if (addSection) items.push(addSection);
  // Wearing D&D Beyond's own Monsters glyph in D&D Beyond's own red, because
  // what it opens is their page rather than anything of ours — the one row in
  // this menu that is a door into the compendium rather than an edit.
  if (compare) {
    items.push({
      label: "Compare to…",
      icon: "monsters",
      iconTone: "brand",
      onClick: () => compare.open(),
    });
  }
  // Last, below the three that change the creature: this is the one that leaves.
  //
  // Disabled while a save is outstanding, because the page it opens is rendered
  // by D&D Beyond from what it has stored — which, mid-debounce, is the
  // creature as it was before the last few edits. Waiting for the save instead
  // isn't an option: it takes longer than the click's transient activation
  // lasts, and the new tab would be blocked as a popup.
  const details = detailsUrl(location.href);
  if (details) {
    items.push({
      label: "Go to details page",
      icon: "openInNew",
      disabled: unsaved,
      title: unsaved ? UNSAVED_NOTE : undefined,
      onClick: () => void window.open(details, "_blank", "noopener"),
    });
  }

  return (
    <div class={stuck.pinned ? "name-row is-stuck" : "name-row"} ref={stuck.ref}>
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
