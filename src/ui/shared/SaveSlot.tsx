/**
 * Where the autosave spinner — or a failed save's retry button — goes for one
 * part of the stat block.
 *
 * Empty and zero-width while idle, so it costs nothing visually until
 * something is actually saving. The indicator is painted into it by
 * `applySaveState`, which finds slots by origin: saves land on their own
 * schedule, not on the render loop's, so it repaints directly rather than
 * waiting for the tree to re-render.
 */
export function SaveSlot({ origin }: { origin: string }) {
  return <span class="save-slot" data-save-origin={origin} />;
}
