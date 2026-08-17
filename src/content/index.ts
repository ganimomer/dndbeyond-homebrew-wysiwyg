/**
 * Content-script entry. Shared across all browsers — the only per-browser
 * difference is in the manifest that injects this file.
 *
 * Responsibilities:
 *   1. Pick the adapter for the current homebrew page (monsters, for now).
 *   2. Mount the WYSIWYG panel when a matching form is present.
 *   3. Re-evaluate on D&D Beyond's client-side navigations (it's a SPA, so
 *      the content script isn't re-injected between "pages").
 */
import { DdbMonsterAdapter } from "../adapter/ddb-monster.js";
import type { PageAdapter } from "../adapter/types.js";
import { EditorPanel } from "../editor/panel.js";

const adapters: PageAdapter[] = [new DdbMonsterAdapter()];

let panel: EditorPanel | null = null;

function activeAdapter(): PageAdapter | null {
  return adapters.find((a) => a.matches()) ?? null;
}

function sync(): void {
  const adapter = activeAdapter();
  if (adapter && !panel) {
    panel = new EditorPanel(adapter);
    panel.mount();
  } else if (!adapter && panel) {
    panel.unmount();
    panel = null;
  }
}

/** Detects SPA route changes by patching history + listening to popstate. */
function watchNavigation(onChange: () => void): void {
  const fire = () => queueMicrotask(onChange);
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      fire();
      return result;
    };
  }
  window.addEventListener("popstate", fire);
}

function start(): void {
  sync();
  watchNavigation(sync);
  // DDB renders forms asynchronously; give late-mounting forms a few chances.
  let attempts = 0;
  const poll = window.setInterval(() => {
    sync();
    if (++attempts >= 20 || panel) window.clearInterval(poll);
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
