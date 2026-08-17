/**
 * Content-script entry. Shared across all browsers — the only per-browser
 * difference is in the manifest that injects this file.
 *
 * Responsibilities:
 *   1. Pick the adapter for the current homebrew page (monsters, for now).
 *   2. When a matching editor is present, show the "Open in Microbrewery"
 *      launcher; opening it swaps the launcher for the WYSIWYG panel, and
 *      closing the panel restores the launcher.
 *   3. Re-evaluate on D&D Beyond's client-side navigations (it's a SPA, so
 *      the content script isn't re-injected between "pages").
 */
import { DdbMonsterAdapter } from "../adapter/ddb-monster.js";
import type { PageAdapter } from "../adapter/types.js";
import { EditorPanel } from "../editor/panel.js";
import { Fab } from "../editor/fab.js";

const adapters: PageAdapter[] = [new DdbMonsterAdapter()];

let currentAdapter: PageAdapter | null = null;
let fab: Fab | null = null;
let panel: EditorPanel | null = null;

function activeAdapter(): PageAdapter | null {
  return adapters.find((a) => a.matches()) ?? null;
}

function showLauncher(): void {
  if (!currentAdapter || fab || panel) return;
  fab = new Fab({ onOpen: openEditor });
  fab.mount();
}

function openEditor(): void {
  if (!currentAdapter || panel) return;
  fab?.unmount();
  fab = null;
  panel = new EditorPanel(currentAdapter, { onClose: closeEditor });
  panel.mount();
}

function closeEditor(): void {
  panel?.unmount();
  panel = null;
  showLauncher();
}

function teardown(): void {
  fab?.unmount();
  fab = null;
  panel?.unmount();
  panel = null;
}

function sync(): void {
  const adapter = activeAdapter();
  if (adapter) {
    currentAdapter = adapter;
    if (!fab && !panel) showLauncher();
  } else if (currentAdapter) {
    currentAdapter = null;
    teardown();
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
    if (++attempts >= 20 || fab || panel) window.clearInterval(poll);
  }, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
