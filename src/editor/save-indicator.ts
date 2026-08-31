/**
 * Paints autosave state into the `[data-save-origin]` slots the renderers leave
 * behind (see `saveSlot` in preview/dom.ts).
 *
 * This is deliberately a plain function over a scope rather than a component:
 * the panel rebuilds the whole stat block on every form mutation, so the
 * indicator has to be re-applicable to a freshly rendered tree — and also
 * applicable *without* a re-render, since a save starts and ends on a page
 * that isn't mutating.
 *
 * A section whose slot isn't in the tree (the 5e Traits block has no heading to
 * hang one on) falls back to the header slot, so its spinner still shows up
 * somewhere sensible rather than vanishing.
 */
import { makeIcon } from "../ui/shared/icons.js";
import type { SaveOrigin, SaveState } from "./autosave.js";

/** The origin used for the stat block's top area (name row, before the menu). */
export const HEADER_ORIGIN = "header";

function slots(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>("[data-save-origin]"));
}

/** True when `scope` has a slot for `origin` — else callers use the header. */
export function hasSlot(scope: ParentNode, origin: SaveOrigin): boolean {
  return !!scope.querySelector(`[data-save-origin="${origin}"]`);
}

/**
 * Resolves where an origin's indicator should actually appear: its own slot if
 * the current layout renders one, otherwise the header.
 */
export function resolveOrigin(scope: ParentNode, origin: SaveOrigin): SaveOrigin {
  return hasSlot(scope, origin) ? origin : HEADER_ORIGIN;
}

function spinner(): HTMLElement {
  const s = document.createElement("span");
  s.className = "save-spinner";
  s.setAttribute("role", "status");
  s.setAttribute("aria-label", "Saving");
  return s;
}

function retryButton(onRetry: () => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "save-retry";
  button.title = "Couldn't save — click to retry";
  button.setAttribute("aria-label", "Couldn't save — retry");
  button.append(makeIcon("syncProblem"));
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRetry();
  });
  return button;
}

/**
 * Brings every slot in `scope` in line with `state`. Idempotent — safe to call
 * on each render and on each state change.
 */
export function applySaveState(
  scope: ParentNode,
  state: SaveState,
  onRetry: () => void,
): void {
  const active = new Set(
    [...state.origins].map((origin) => resolveOrigin(scope, origin)),
  );

  for (const slot of slots(scope)) {
    const origin = slot.dataset.saveOrigin ?? "";
    const wanted = active.has(origin) ? state.status : "idle";

    // Cheap no-op on the overwhelmingly common path (idle slot, idle state),
    // and it keeps a running spinner's CSS animation from restarting.
    if (slot.dataset.saveShown === wanted) continue;
    slot.dataset.saveShown = wanted;

    slot.classList.toggle("is-saving", wanted === "saving");
    slot.classList.toggle("is-error", wanted === "error");
    if (wanted === "saving") slot.replaceChildren(spinner());
    else if (wanted === "error") slot.replaceChildren(retryButton(onRetry));
    else slot.replaceChildren();
  }
}
