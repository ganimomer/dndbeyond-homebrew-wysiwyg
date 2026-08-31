/**
 * The ids this browser has learned, kept between sessions.
 *
 * Turning a reference's *name* into D&D Beyond's numeric *id* is the expensive
 * half of a tooltip: for anything outside the shipped table it means fetching
 * their canonical slug URL and reading where the 301 landed, and because that
 * redirect points at a whole rendered page, it costs about a second. The answer
 * never changes, so paying for it twice is pure waste.
 *
 * **Ids go to disk; tooltip bodies never do.** An id is public — it is literally
 * in a URL. A tooltip body is not: a paywalled reference answers with a stub
 * that records which books this account does *not* own, and that must not
 * outlive the session or survive a sign-out. Nor are misses remembered: a
 * permanent "no such spell" would outlive D&D Beyond fixing their side, and a
 * miss only costs one probe.
 */
import type { ReferenceTarget } from "./ddb-reference-map.js";

/**
 * The narrowest slice of `browser.storage.local` this needs. The real thing
 * satisfies it structurally, and a plain object does in tests — which is why
 * this module never imports the polyfill.
 */
export interface KeyValueArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ReferenceIdStore {
  /** Resolves once the persisted table is in memory. */
  readonly ready: Promise<void>;
  /** Synchronous after `ready` — the storage round-trip happens once, not per lookup. */
  get(target: ReferenceTarget): number | null;
  remember(target: ReferenceTarget, id: number): void;
  /** Writes now rather than waiting out the debounce. For panel close. */
  flush(): Promise<void>;
}

const KEY = "microbrewery.referenceIds";
const VERSION = 1;
/** ~12 KB against a 10 MB budget; several bestiaries' worth of working set. */
const CAP = 500;
const WRITE_DELAY_MS = 1000;

interface Stored {
  v: number;
  ids: Record<string, number>;
}

export interface LearnedReferenceIdsOptions {
  cap?: number;
  writeDelayMs?: number;
}

export class LearnedReferenceIds implements ReferenceIdStore {
  readonly ready: Promise<void>;
  private readonly area: KeyValueArea;
  private readonly cap: number;
  private readonly writeDelayMs: number;
  private ids: Record<string, number> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(area: KeyValueArea, options: LearnedReferenceIdsOptions = {}) {
    this.area = area;
    this.cap = options.cap ?? CAP;
    this.writeDelayMs = options.writeDelayMs ?? WRITE_DELAY_MS;
    this.ready = this.load();
  }

  get(target: ReferenceTarget): number | null {
    return this.ids[keyFor(target)] ?? null;
  }

  remember(target: ReferenceTarget, id: number): void {
    const key = keyFor(target);
    if (this.ids[key] === id) return;
    this.ids[key] = id;
    this.dirty = true;
    // A preload sweep learns fifteen ids in a few seconds; this makes that one
    // write rather than fifteen.
    if (this.timer === null) {
      this.timer = setTimeout(() => void this.flush(), this.writeDelayMs);
    }
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.prune();
    try {
      await this.area.set({ [KEY]: { v: VERSION, ids: this.ids } satisfies Stored });
    } catch {
      // Quota, a closed port, a browser mid-shutdown — a cache must never be
      // the reason a hover breaks.
    }
  }

  /**
   * Anything that isn't this version starts empty. No migration will ever be
   * written for this: it is a cache, and discarding it costs one redirect probe
   * per reference. That is the whole policy.
   */
  private async load(): Promise<void> {
    let raw: unknown;
    try {
      raw = (await this.area.get(KEY))[KEY];
    } catch {
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const stored = raw as Partial<Stored>;
    if (stored.v !== VERSION || !stored.ids || typeof stored.ids !== "object") return;
    for (const [key, id] of Object.entries(stored.ids)) {
      if (typeof id === "number" && Number.isInteger(id)) this.ids[key] = id;
    }
  }

  /**
   * Oldest-first eviction, using insertion order: `path/slug` keys are never
   * integer-like, so JS preserves the order they were added in. Not LRU — that
   * needs a timestamp per entry, which doubles the size on disk and turns every
   * *read* into a write.
   */
  private prune(): void {
    const keys = Object.keys(this.ids);
    for (const key of keys.slice(0, Math.max(0, keys.length - this.cap))) {
      delete this.ids[key];
    }
  }
}

function keyFor(target: ReferenceTarget): string {
  return `${target.path}/${target.slug}`;
}
