/**
 * The editor overlay's root.
 *
 * It owns the shadow root's stylesheet, the backdrop, the scrolling page, and
 * the one subscription to the store: everything below reads through
 * `store-context`, so a change re-renders the tree and Preact works out what
 * actually moved.
 *
 * The two kinds of change want different timing, which is why the store says
 * which it was. Form mutations arrive in bursts — one edit can touch four
 * fields — so they coalesce into a frame. Session changes must not: a
 * mini-form's click-away depends on the re-render landing inside the click that
 * caused it, while that click is still in its capture phase.
 */
import type { RefObject } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { PageAdapter } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";
import { EditorStore } from "../state/store.js";
import { applyDependencyHighlights } from "../editor/dependency-highlights.js";
import { applySaveState } from "../editor/save-indicator.js";
import { StoreContext } from "./store-context.js";
import { StatBlock } from "./StatBlock.js";
import { AvatarToast } from "./AvatarToast.js";
import { LookupProvider, useLookupState } from "./lookup/lookup-context.js";
import appCss from "./App.css";
import statBlockCss from "./StatBlock.css";
import artworkCss from "./Artwork.css";
import avatarToastCss from "./AvatarToast.css";
import nameRowCss from "./NameRow.css";
import abilityScoresCss from "./fields/AbilityScores.css";
import metaLineCss from "./fields/MetaLine.css";
import statusChipCss from "./fields/StatusChip.css";
import chipCss from "./shared/Chip.css";
import skillsRowCss from "./fields/SkillsRow.css";
import speedRowCss from "./fields/SpeedRow.css";
import hitPointsCss from "./fields/HitPointsField.css";
import armorClassCss from "./fields/ArmorClassField.css";
import miniFormCss from "./shared/MiniForm.css";
import sensesRowCss from "./fields/SensesRow.css";
import textRowCss from "./fields/TextRow.css";
import addFieldCss from "./fields/AddFieldMenu.css";
import addSectionCss from "./AddSectionButton.css";
import saveSlotCss from "./shared/SaveSlot.css";
import proseCss from "./prose/ProseSection.css";
import proseItemCss from "./prose/ProseItem.css";
import sectionListCss from "./prose/SectionList.css";
import itemGapCss from "./prose/ItemGap.css";
import dragHandleCss from "./prose/DragHandle.css";
import formatToolbarCss from "./prose/FormatToolbar.css";
import lookupFrameCss from "./lookup/LookupFrame.css";
import referenceMenuCss from "./prose/ReferenceMenu.css";
import removeSectionCss from "./prose/RemoveSection.css";
import removeItemCss from "./prose/RemoveItem.css";
import contextMenuCss from "./shared/ContextMenu.css";
import confirmDialogCss from "./shared/ConfirmDialog.css";
import addButtonCss from "./shared/AddButton.css";
import optionPickerCss from "./shared/OptionPicker.css";
import statblock5eCss from "./StatBlock5e.css";
import statblock55eCss from "./StatBlock55e.css";

/**
 * One stylesheet for the whole shadow root, assembled from the components'.
 *
 * Rendered as part of the tree rather than appended alongside it, so Preact
 * owns every node under the root and nothing it diffs can trip over a stray
 * sibling. The order is the cascade: the shared chrome first, then the fields,
 * then the two layouts — which come last because their job is to say how a
 * given ruleset differs from everything above.
 */
const STYLES = [
  appCss,
  statBlockCss,
  artworkCss,
  avatarToastCss,
  nameRowCss,
  abilityScoresCss,
  metaLineCss,
  chipCss,
  statusChipCss,
  skillsRowCss,
  speedRowCss,
  hitPointsCss,
  armorClassCss,
  miniFormCss,
  sensesRowCss,
  textRowCss,
  addFieldCss,
  addSectionCss,
  saveSlotCss,
  proseCss,
  proseItemCss,
  sectionListCss,
  itemGapCss,
  dragHandleCss,
  formatToolbarCss,
  referenceMenuCss,
  lookupFrameCss,
  removeSectionCss,
  removeItemCss,
  contextMenuCss,
  confirmDialogCss,
  // After ContextMenu's: `.sb-add` and `.cm-trigger` tie on specificity, and one
  // of the buttons it styles is a context-menu trigger.
  addButtonCss,
  optionPickerCss,
  statblock5eCss,
  statblock55eCss,
].join("\n");

export interface AppProps {
  adapter: PageAdapter;
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export function App({ adapter, onClose }: AppProps) {
  // Started as it is created, not in the effect below: the very first render
  // has to have the creature in hand. Reading the form is what the store is
  // for, and the overlay is never built without one.
  const store = useMemo(() => {
    const created = new EditorStore(adapter);
    created.start();
    return created;
  }, [adapter]);
  const [, repaint] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const unsubscribe = store.subscribe((change) => {
      if (change === "session") {
        repaint((n) => n + 1);
        return;
      }
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        repaint((n) => n + 1);
      });
    });
    // Best-effort flush when the tab goes away mid-debounce. The save is far
    // too large for `keepalive`, so an immediate unload can still cut it off —
    // but DDB puts up its own unsaved-changes prompt, which usually buys enough
    // time.
    const onBeforeUnload = () => void store.autosave.flush();
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (frame.current) cancelAnimationFrame(frame.current);
      store.stop();
    };
  }, [store]);

  // Saves land on their own schedule — a request starting or finishing doesn't
  // touch the form — so the indicators are painted directly rather than through
  // a re-render.
  useLayoutEffect(() => {
    return store.autosave.onStateChange((state) => {
      if (stage.current) applySaveState(stage.current, state, () => store.autosave.retry());
    });
  }, [store]);

  const monster = store.getMonster();

  // Two passes over the finished block that belong to no single field: the
  // dependency flags a score change leaves across the whole thing, and the
  // save indicator repainted onto freshly rendered slots.
  useLayoutEffect(() => {
    if (!stage.current || !monster) return;
    applyDependencyHighlights(stage.current, store.getSession().changedAbilities);
    applySaveState(stage.current, store.autosave.state, () => store.autosave.retry());
  });

  return (
    <StoreContext.Provider value={store}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <LookupProvider>
        <Overlay stage={stage} monster={monster} onClose={onClose} />
      </LookupProvider>
    </StoreContext.Provider>
  );
}

/**
 * The overlay itself, which is a component only so that it can be *under* the
 * lookup provider and read from it. What it reads is one class: a lookup
 * widens the stage, and since the page centres what it holds, widening is what
 * slides the block left — see App.css.
 */
function Overlay({
  stage,
  monster,
  onClose,
}: {
  stage: RefObject<HTMLDivElement>;
  monster: Monster | null;
  onClose?: () => void;
}) {
  const lookup = useLookupState();
  return (
    <div class={lookup?.phase === "open" ? "overlay is-looking-up" : "overlay"}>
      <div class="page">
        <div class="stage" ref={stage}>
          {monster ? <StatBlock monster={monster} onClose={onClose} /> : null}
        </div>
      </div>
      {/* Outside the scrolling page: it reports on something off screen. */}
      <AvatarToast />
    </div>
  );
}
