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
import { defaultImageUrl } from "./default-image.js";
import { sectionBody } from "./prose/sections.js";
import { Raw } from "./shared/Raw.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { StatBlock5e } from "./StatBlock5e.js";
import { StatBlock55e } from "./StatBlock55e.js";

/**
 * The creature artwork, placed beside the block (top-right). Falls back to the
 * creature type's default when no avatar is set, and renders nothing when
 * there's neither.
 */
function Artwork({ monster }: { monster: Monster }) {
  const src = monster.image ?? defaultImageUrl(monster.type);
  if (!src) return null;
  return (
    <div class={monster.image ? "sb-image" : "sb-image is-default"}>
      <img src={src} alt={monster.name} />
    </div>
  );
}

function Description({ monster }: { monster: Monster }) {
  const body = sectionBody(monster, "characteristics");
  if (!body) return null;
  return (
    <div class="sb-description">
      <h3 class="sb-description-heading">
        Description
        <SaveSlot origin="characteristics" />
      </h3>
      <Raw class="sb-description-content" node={body} data-section="characteristics" />
    </div>
  );
}

export function StatBlock({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const Layout = monster.ruleset === "5e" ? StatBlock5e : StatBlock55e;
  return (
    <div class="sb-doc">
      {/* Stat block and artwork sit side by side; the image wraps below on
          narrow viewports (see .sb-layout). */}
      <div class="sb-layout">
        <Layout monster={monster} onClose={onClose} />
        <Artwork monster={monster} />
      </div>
      <Description monster={monster} />
    </div>
  );
}
