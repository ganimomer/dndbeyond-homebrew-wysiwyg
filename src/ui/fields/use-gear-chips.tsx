/**
 * Acting on a piece of gear, rather than only reading it.
 *
 * The Gear row is a line of references, and a reference to armor is the one
 * piece of gear that says something about the rest of the stat block: swapping
 * Splint Armor for Chain Mail should take the armor class with it. This is
 * where that connection is made — click a chip, and if the table in
 * `statblock/armor.ts` recognises it, the menu offers to replace it from a list
 * of mundane armor.
 *
 * What it deliberately does *not* do is write the armor class. Picking new
 * armor changes the gear, because that is what the author asked for, and
 * *offers* the class that armor implies, because the number on the block may
 * have been set on purpose — a homebrew veteran in splint who is nonetheless
 * AC 18. The offer is left on the session for the armor-class field to make;
 * see `use-armor-suggestion.ts`.
 *
 * Only Gear uses this. The Languages row shares `TextRow` and has no chips to
 * act on.
 */
import type { RefObject } from "preact";
import type { VNode } from "preact";
import { useState } from "preact/hooks";
import { ARMOR_KIND, slugToWrite, type ReferenceEntity } from "../../adapter/reference-catalog.js";
import { armorAc, armorByName, armorFor } from "../../statblock/armor.js";
import { abilityModifier } from "../../statblock/compute.js";
import type { ProseEditor, RefHit } from "../../editor/prose-editor.js";
import type { MenuItem } from "../shared/ContextMenu.js";
import { ChipMenu } from "../prose/ChipMenu.js";
import { ReferenceMenu } from "../prose/ReferenceMenu.js";
import { useMonster, useStore } from "../store-context.js";

export interface GearChips {
  /** For `ProseEditorOptions.onRefSelect`. */
  onRefSelect: (hit: RefHit | null) => void;
  /** True while a menu holds the caret — the re-sync guard wants to know. */
  isAway: () => boolean;
  /** The menus, for the row to render inside its own box. */
  node: VNode | null;
}

/** Which menu is up over the selected chip, if either. */
type Stage = "menu" | "replacing";

export function useGearChips(editor: RefObject<ProseEditor | null>): GearChips {
  const store = useStore();
  const monster = useMonster();
  const [hit, setHit] = useState<RefHit | null>(null);
  const [stage, setStage] = useState<Stage>("menu");

  const dismiss = () => {
    setHit(null);
    setStage("menu");
  };

  /**
   * The author picked new armor.
   *
   * The session is written *before* the gear command runs, following the
   * convention `state/lair.ts` spells out: session changes emit synchronously
   * while a monster re-read is coalesced into a frame, so an offer left after
   * the command would be a render behind the gear it explains.
   */
  const replace = (entity: ReferenceEntity) => {
    const box = editor.current;
    const armor = armorByName(entity.name);
    if (!box || !hit || !armor) return dismiss();

    store.update({
      pendingArmor: {
        value: armorAc(armor, abilityModifier(monster.abilities.dex)),
        type: armor.qualifier,
      },
    });
    box.replaceRef(hit.key, {
      macro: ARMOR_KIND.macro,
      name: armor.name,
      slug: slugToWrite(entity),
    });
    dismiss();
  };

  const items = (): MenuItem[] => {
    const list: MenuItem[] = [];
    // Only armor can be replaced this way, because only armor is a thing whose
    // consequences we know. Everything else is a name on a line.
    if (hit && armorFor(hit.token)) {
      list.push({
        label: "Replace…",
        // The same glyph as "Use 5e stat block": both swap one whole thing for
        // another of its kind.
        icon: "loop",
        onClick: () => setStage("replacing"),
      });
    }
    list.push({
      label: "Remove",
      icon: "delete",
      danger: true,
      onClick: () => {
        if (hit) editor.current?.removeRef(hit.key);
        dismiss();
      },
    });
    return list;
  };

  return {
    onRefSelect: (next) => {
      setHit(next);
      setStage("menu");
    },
    isAway: () => hit !== null,
    node: !hit ? null : stage === "replacing" ? (
      <ReferenceMenu
        anchor={hit.rect}
        kind={ARMOR_KIND}
        // The "what kind of thing?" stage is skipped: the question was already
        // answered by the chip that was clicked being armor.
        kinds={[]}
        active={-1}
        onHighlight={() => {}}
        onChooseKind={() => {}}
        onChoose={replace}
        onDismiss={dismiss}
      />
    ) : (
      <ChipMenu anchor={hit.rect} items={items()} onDismiss={dismiss} />
    ),
  };
}
