/**
 * What became of a small-avatar upload.
 *
 * The small avatar is the creature's icon on D&D Beyond's listing pages, so the
 * stat block has nowhere to show it and nowhere to report on it — the artwork's
 * own tick belongs to the large one. This says so at the corner of the screen
 * instead, with the picture that was uploaded, since the author has just chosen
 * a file they can no longer see.
 *
 * It has no timer of its own: it is on screen for exactly as long as the upload
 * has a status, and `AvatarUploads` is what takes that away.
 */
import { useSession } from "./store-context.js";
import { Icon } from "./shared/Icon.js";

export function AvatarToast() {
  const status = useSession().avatarStatus.get("small");
  // While it's saving, the artwork's own overlay is already saying so.
  if (!status || status.state === "saving") return null;

  const failed = status.state === "error";
  return (
    <div class={failed ? "avatar-toast is-error" : "avatar-toast is-success"} role="status">
      {status.thumbUrl ? <img class="avatar-toast-thumb" src={status.thumbUrl} alt="" /> : null}
      <span class="avatar-toast-text">
        <strong>Small avatar</strong>
        <span>{failed ? (status.message ?? "Upload failed") : "uploaded"}</span>
      </span>
      <Icon name={failed ? "syncProblem" : "check"} class="avatar-toast-icon" size={20} />
    </div>
  );
}
