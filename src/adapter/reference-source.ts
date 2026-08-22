/**
 * The page's one reference source.
 *
 * A singleton rather than one per panel, for two reasons that both come down
 * to not throwing away what we have already paid for. D&D Beyond's tooltip
 * endpoint answers `cache-control: no-cache` once the session cookie is
 * attached — which is how we must fetch it, since entitlement rides on that
 * cookie — so the browser caches none of this and our own map is the only
 * thing standing between a reopened panel and re-fetching every definition.
 * And the learned id table only has to be read off disk once.
 *
 * This is also the only place the real storage is constructed. `DdbReferenceSource`
 * takes the store as an option and never imports the polyfill itself, which is
 * what lets it be unit-tested outside an extension context.
 */
import { DdbReferenceSource } from "./ddb-references.js";
import { LearnedReferenceIds, type KeyValueArea } from "./reference-id-store.js";

let source: DdbReferenceSource | null = null;
let ids: LearnedReferenceIds | null = null;

export function pageReferenceSource(): DdbReferenceSource {
  if (!source) {
    const area = storageArea();
    ids = area ? new LearnedReferenceIds(area) : null;
    source = new DdbReferenceSource(ids ? { idStore: ids } : {});
  }
  return source;
}

/**
 * `storage.local` straight off the global, rather than through
 * `platform/browser.js`.
 *
 * The polyfill throws *at import time* outside an extension context, and this
 * module is reachable from `EditorPanel` — so importing it would make the panel
 * unloadable in a plain DOM, which is where its tests run. The two methods we
 * want are promise-based natively on Firefox and on Chrome under MV3, so the
 * narrow `KeyValueArea` shape needs no shimming at all.
 *
 * Absent (a page with no extension APIs), we simply don't persist: every
 * lookup still works, it just re-learns its ids each session.
 */
function storageArea(): KeyValueArea | null {
  const api = (globalThis as { browser?: unknown; chrome?: unknown }).browser
    ?? (globalThis as { chrome?: unknown }).chrome;
  const local = (api as { storage?: { local?: unknown } } | undefined)?.storage?.local;
  const area = local as Partial<KeyValueArea> | undefined;
  return typeof area?.get === "function" && typeof area.set === "function"
    ? (area as KeyValueArea)
    : null;
}

/** Writes anything the session learned, without waiting out the debounce. */
export function flushReferenceIds(): Promise<void> {
  return ids?.flush() ?? Promise.resolve();
}
