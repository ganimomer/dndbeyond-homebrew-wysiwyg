/**
 * Uploading the creature's avatars, and saying how it's going.
 *
 * An avatar is the one edit that isn't a value in a form control: the author
 * picks a file, D&D Beyond's own `<input type=file>` holds it, and the ordinary
 * whole-form save carries it up. So there is no command here and nothing to
 * undo — the bytes of whatever was there before are gone the moment the new
 * file is chosen — and no request of our own either.
 *
 * What it *does* own is the reporting, which differs from every other edit in
 * two ways. It saves at once rather than waiting out the debounce, because an
 * upload is a deliberate act and the author is watching for it to land. And it
 * reports where the author is looking: in place on the artwork for the large
 * avatar, which the stat block shows, and in a toast for the small one, which it
 * doesn't.
 */
import type { AvatarSize, PageAdapter } from "../adapter/types.js";
import type { AutosaveController, SaveOrigin } from "../editor/autosave.js";
import { withAvatarStatus, type AvatarStatus, type SessionState } from "./session.js";

/** Where an avatar's spinner goes. No slot renders it, so it falls to the header. */
export const AVATAR_ORIGIN: SaveOrigin = "avatar";

/** How long a green tick stays up before the artwork goes back to normal. */
const SUCCESS_MS = 2500;
/** Longer for a failure — it says something the author has to read. */
const ERROR_MS = 6000;

/** What the toast and the artwork say when a save simply didn't go through. */
const FAILED = "Upload failed";

/** The part of the store this needs: session state to read and to patch. */
export interface AvatarHost {
  getSession(): SessionState;
  update(patch: Partial<SessionState>): void;
}

export class AvatarUploads {
  private unsubscribe: (() => void) | null = null;
  /** The dismissal timer for each avatar's status; one at a time per avatar. */
  private timers = new Map<AvatarSize, ReturnType<typeof setTimeout>>();
  /** Object URLs we made, so they can be released when the session ends. */
  private urls = new Set<string>();

  constructor(
    private readonly adapter: PageAdapter,
    private readonly autosave: AutosaveController,
    private readonly host: AvatarHost,
  ) {}

  /** Starts listening for files chosen in either avatar input. */
  start(): void {
    this.unsubscribe ??= this.adapter.onAvatarChosen((size, file) => {
      void this.upload(size, file);
    });
  }

  /**
   * Opens the file picker. Synchronous all the way down to the input's click,
   * because a browser only opens a picker inside the gesture that asked for it.
   */
  choose(size: AvatarSize): void {
    if (this.adapter.chooseAvatar(size)) return;
    this.settle(size, { state: "error", thumbUrl: "", message: "Upload isn't available" });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  private async upload(size: AvatarSize, file: File): Promise<void> {
    const problem = this.adapter.avatarProblem(size, file);
    if (problem) {
      // Nothing has been posted and nothing will be, but the file is sitting in
      // DDB's input where the next save would pick it up. Take it back out.
      this.adapter.clearAvatar(size);
      this.settle(size, { state: "error", thumbUrl: this.objectUrl(file), message: problem });
      return;
    }

    const thumbUrl = this.objectUrl(file);
    const previousPreview = this.host.getSession().avatarPreview;
    this.clearTimer(size);
    this.host.update({
      // The large avatar *is* the artwork, so show it before it's saved: the
      // author chose this picture and the block should be showing that picture.
      ...(size === "large" ? { avatarPreview: thumbUrl } : {}),
      avatarStatus: withAvatarStatus(this.host.getSession(), size, { state: "saving", thumbUrl }),
    });

    // Save now rather than in three seconds' time, and let `flush()` do the
    // waiting: it already skips the debounce, keeps to one request at a time,
    // and sits through the automatic retry before giving up.
    this.autosave.request(AVATAR_ORIGIN);
    await this.autosave.flush();
    const failed = this.autosave.state.status === "error";

    if (failed) {
      // Leave the file in the input: the origins went back on autosave's pending
      // set, so the next save carries the image again without being asked to.
      if (size === "large") this.host.update({ avatarPreview: previousPreview });
      this.settle(size, { state: "error", thumbUrl, message: FAILED });
      return;
    }
    // Saved. Empty the input, or every later save would post the image again.
    this.adapter.clearAvatar(size);
    this.settle(size, { state: "success", thumbUrl });
  }

  /** Shows a finished upload's outcome, and takes it down again after a while. */
  private settle(size: AvatarSize, status: AvatarStatus): void {
    this.clearTimer(size);
    this.host.update({ avatarStatus: withAvatarStatus(this.host.getSession(), size, status) });
    const timer = setTimeout(() => {
      this.timers.delete(size);
      this.host.update({ avatarStatus: withAvatarStatus(this.host.getSession(), size, null) });
    }, status.state === "error" ? ERROR_MS : SUCCESS_MS);
    this.timers.set(size, timer);
  }

  private clearTimer(size: AvatarSize): void {
    const timer = this.timers.get(size);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(size);
  }

  private objectUrl(file: File): string {
    const url = URL.createObjectURL(file);
    this.urls.add(url);
    return url;
  }
}
