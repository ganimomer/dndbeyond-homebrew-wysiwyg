/**
 * The whole stat-block document: the framed block in whichever layout the
 * creature is authored under, its artwork alongside, and the free-form
 * Description section beneath.
 *
 * The artwork and the description sit *outside* the frame, mirroring D&D
 * Beyond's own monster page — where the characteristics text is ordinary body
 * type below the block rather than part of it.
 */
import { useLayoutEffect, useRef } from "preact/hooks";
import type { Monster } from "../statblock/model.js";
import { Artwork } from "./Artwork.js";
import { SectionBody } from "./prose/SectionBody.js";
import { sectionState } from "./prose/section-state.js";
import { RemoveSection } from "./prose/RemoveSection.js";
import { SECTION_LABEL } from "./prose/section-registry.js";
import { AddSectionButton } from "./AddSectionButton.js";
import { useSession } from "./store-context.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { StatBlock5e } from "./StatBlock5e.js";
import { StatBlock55e } from "./StatBlock55e.js";

/** The accent each layout paints itself in, for the chrome outside the frame. */
const ACCENT = { "5e": "#822000", "5.5e": "#5b160c" } as const;

/** Never let the button ride up into the artwork, however short the block is. */
const MIN_OFFSET = 12;

function Description({ monster }: { monster: Monster }) {
  const session = useSession();
  const state = sectionState(monster, "characteristics", session);
  if (!state.visible) return null;
  return (
    <div class="sb-description">
      <h3 class="sb-description-heading">
        {SECTION_LABEL.characteristics}
        <SaveSlot origin="characteristics" />
        <RemoveSection section="characteristics" />
      </h3>
      <SectionBody
        section="characteristics"
        state={state}
        readOnly={{ class: "sb-description-content" }}
      />
    </div>
  );
}

export function StatBlock({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const Layout = monster.ruleset === "5e" ? StatBlock5e : StatBlock55e;
  const layout = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLDivElement>(null);

  /**
   * Where the "Add section" button comes to rest: level with the line the
   * description sections start on, so that sticky — which never carries an
   * element above its own place in the flow — can't take it any higher.
   *
   * Measured rather than guessed, because the distance is the height of
   * everything above it: the basics section on one side, the artwork on the
   * other, neither of which anything knows until it is laid out. Anchored on
   * the foot of `.basics` rather than the Traits heading itself, since that is
   * the same line and it survives a creature that hasn't got Traits.
   */
  const measure = () => {
    const asideEl = aside.current;
    const basics = layout.current?.querySelector(".statblock .basics");
    if (!asideEl || !basics) return;
    const button = asideEl.querySelector<HTMLElement>(".sb-add-section");
    if (!button) return;
    // The button's own margin is what we're solving for, so take it back out
    // before measuring what sits above it.
    const above = button.previousElementSibling?.getBoundingClientRect().bottom;
    const from = above ?? asideEl.getBoundingClientRect().top;
    const offset = Math.max(MIN_OFFSET, basics.getBoundingClientRect().bottom - from);
    asideEl.style.setProperty("--add-section-offset", `${Math.round(offset)}px`);
  };

  // Every render (cheap, and the block's height moves with almost any edit),
  // plus whatever else changes it behind Preact's back: web fonts landing,
  // a section growing as it's typed into, the artwork arriving.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const target = layout.current;
    if (!target || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div class="sb-doc">
      {/* Stat block and the aside side by side; the aside wraps below the block
          on narrow viewports (see .sb-layout). */}
      <div class="sb-layout" ref={layout}>
        <Layout monster={monster} onClose={onClose} />
        {/* `--accent` is declared on the layouts themselves, and this column is
            outside them — so it carries the creature's own. */}
        <div class="sb-aside" ref={aside} style={`--accent:${ACCENT[monster.ruleset]}`}>
          <Artwork monster={monster} onLoad={measure} />
          <AddSectionButton monster={monster} />
        </div>
      </div>
      <Description monster={monster} />
    </div>
  );
}
