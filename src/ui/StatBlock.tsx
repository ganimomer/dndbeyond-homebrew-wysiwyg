/**
 * The whole stat-block document: the framed block in whichever layout the
 * creature is authored under, its artwork alongside, and the free-form
 * Description section beneath.
 *
 * The artwork and the description sit *outside* the frame, mirroring D&D
 * Beyond's own monster page — where the characteristics text is ordinary body
 * type below the block rather than part of it.
 */
import type { Monster } from "../statblock/model.js";
import { Artwork } from "./Artwork.js";
import { LookupFrame } from "./lookup/LookupFrame.js";
import { CompareFrame } from "./compare/CompareFrame.js";
import { useLookupState } from "./lookup/lookup-context.js";
import { useCompareState } from "./compare/compare-context.js";
import { ItemDragProvider } from "./prose/drag-context.js";
import { SectionBody } from "./prose/SectionBody.js";
import { sectionState } from "./prose/section-state.js";
import { RemoveSection } from "./prose/RemoveSection.js";
import { SECTION_LABEL } from "./prose/section-registry.js";
import { useSession } from "./store-context.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { StatBlock5e } from "./StatBlock5e.js";
import { StatBlock55e } from "./StatBlock55e.js";

/** The accent each layout paints itself in, for the chrome outside the frame. */
const ACCENT = { "5e": "#822000", "5.5e": "#5b160c" } as const;

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
  const lookup = useLookupState();
  const compare = useCompareState();

  return (
    // The provider wraps the whole document rather than either layout: an entry
    // dragged out of Actions has to arrive somewhere, and the sections only
    // meet here.
    <ItemDragProvider>
      <div class="sb-doc">
        {/* Stat block and the aside side by side; the aside wraps below the block
            on narrow viewports (see .sb-layout). */}
        <div class="sb-layout">
          <Layout monster={monster} onClose={onClose} />
          {/* `--accent` is declared on the layouts themselves, and this column is
              outside them — so it carries the creature's own. A framed D&D Beyond
              page takes the column whole: what the author is reading is over
              there, and a picture is not what they came for.

              The lookup comes first in the markup so that a comparison behind it
              can be hidden by a plain sibling rule — see CompareFrame.css. */}
          <div class="sb-aside" style={`--accent:${ACCENT[monster.ruleset]}`}>
            {lookup ? <LookupFrame state={lookup} /> : null}
            {compare ? <CompareFrame state={compare} /> : null}
            {!lookup && !compare ? <Artwork monster={monster} /> : null}
          </div>
        </div>
        <Description monster={monster} />
      </div>
    </ItemDragProvider>
  );
}
