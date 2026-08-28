/**
 * The creature artwork beside the block, and the way an author changes it.
 *
 * Hovering dims the picture and offers a menu over it, which is the whole
 * affordance: D&D Beyond keeps the two avatars as file inputs at the foot of a
 * long form, and this puts them on the thing they're a picture of. The menu sits
 * over the type fallback too — a creature with no avatar yet is exactly the one
 * whose author most wants to upload one.
 *
 * While an upload is in flight the dim stays up whether or not the pointer is
 * still there, with a spinner in the menu's place: the picture on screen is not
 * yet the picture D&D Beyond has, and it shouldn't look settled until it is. The
 * large avatar reports its outcome here, in place; the small one — which this
 * block never shows — reports it in `AvatarToast` instead.
 */
import type { Monster } from "../statblock/model.js";
import { defaultImageUrl } from "./default-image.js";
import { useSession, useStore } from "./store-context.js";
import { ContextMenu } from "./shared/ContextMenu.js";
import { Icon } from "./shared/Icon.js";

export function Artwork({ monster }: { monster: Monster }) {
  const store = useStore();
  const session = useSession();
  // A file chosen this session outranks the form's own preview, which is
  // server-rendered and still showing whatever was there before.
  const src = session.avatarPreview ?? monster.image ?? defaultImageUrl(monster.type);
  if (!src) return null;

  const large = session.avatarStatus.get("large");
  const small = session.avatarStatus.get("small");
  // Either upload holds the overlay open while it saves; only the large one
  // reports its outcome here.
  const saving = large?.state === "saving" || small?.state === "saving";
  const settled = large?.state === "success" || large?.state === "error" ? large : null;
  const held = saving || settled !== null;

  const classes = ["sb-image"];
  if (!monster.image && !session.avatarPreview) classes.push("is-default");
  if (held) classes.push("is-busy");

  return (
    <div class={classes.join(" ")}>
      <img src={src} alt={monster.name} />
      <div class="sb-image-overlay">
        {held ? null : (
          <div class="sb-image-menu">
            <ContextMenu
              triggerLabel="Change artwork"
              triggerClass="on-image"
              items={[
                {
                  label: "Upload small avatar…",
                  icon: "image",
                  onClick: () => store.avatars.choose("small"),
                },
                {
                  label: "Upload large avatar…",
                  icon: "image",
                  onClick: () => store.avatars.choose("large"),
                },
              ]}
            />
          </div>
        )}
        {saving ? (
          // The heading indicator's own spinner, sized up by the box it's in —
          // it's drawn in `em`, so it grows with the type around it.
          <span class="sb-image-state">
            <span class="save-spinner" role="status" aria-label="Uploading" />
          </span>
        ) : null}
        {!saving && settled?.state === "success" ? (
          <span class="sb-image-state is-success" role="status">
            <Icon name="check" size={30} />
          </span>
        ) : null}
        {!saving && settled?.state === "error" ? (
          <span class="sb-image-state is-error" role="status">
            {settled.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
