/**
 * Warming the block's definitions before anyone hovers them.
 *
 * Resolving a reference D&D Beyond doesn't have a shipped id for costs about a
 * second, nearly all of it spent waiting on their server to render a page we
 * throw away — see `ddb-references.ts`. That is far too long to discover when
 * the pointer is already resting on the word. But a stat block says up front
 * exactly which references it contains, so we can ask for all of them while the
 * author is still reading, and by the time they hover, the answer is in hand.
 *
 * Everything here is at `background` priority, which yields to a hover at the
 * queue and asks the browser to deprioritise the request. Nobody is waiting on
 * this work, and it should never behave as though they were.
 *
 * **It only ever reads.** No node is touched, no attribute set — so Lexical's
 * own observer sees nothing, and the rule the hover controller lives by holds
 * here unchanged.
 */
import { refToTarget } from "../adapter/ddb-reference-map.js";
import type { ReferenceSource } from "../adapter/types.js";
import { readToken } from "./ref-token.js";

/** How long DOM changes are coalesced before another look. */
const SETTLE_MS = 300;
/** A ceiling on one panel session, so a pathological block can't flood DDB. */
const LIMIT = 60;
/** Idle deadline: warm the block soon even on a busy page. */
const IDLE_TIMEOUT_MS = 2000;
/** Fallback cadence where `requestIdleCallback` isn't available. */
const FALLBACK_MS = 200;

/** Defers a chunk of work, returning its canceller. */
export type Schedule = (run: () => void) => () => void;

export interface RefPreloaderOptions {
  /** Where references are found: the overlay's shadow root. */
  scope: ShadowRoot;
  source: ReferenceSource;
  /** Test seam. Defaults to idle time. */
  schedule?: Schedule;
  settleMs?: number;
  limit?: number;
}

export class RefPreloader {
  private readonly scope: ShadowRoot;
  private readonly source: ReferenceSource;
  private readonly schedule: Schedule;
  private readonly settleMs: number;
  private readonly limit: number;
  /** Targets already offered, so a rescan of an unchanged block costs nothing. */
  private readonly seen = new Set<string>();
  private observer: MutationObserver | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelScheduled: (() => void) | null = null;
  private stopped = false;

  constructor(options: RefPreloaderOptions) {
    this.scope = options.scope;
    this.source = options.source;
    this.schedule = options.schedule ?? idleSchedule;
    this.settleMs = options.settleMs ?? SETTLE_MS;
    this.limit = options.limit ?? LIMIT;
  }

  start(): void {
    this.stopped = false;
    // Deliberately not synchronous. The sections may not have mounted their
    // spans in the same task as the panel, and depending on when Preact and
    // Lexical happen to flush would tie this to a detail neither promises.
    // Firing a dozen requests inside the mount task would also delay the
    // overlay's first paint, which someone *is* waiting on.
    this.defer();
    // `childList` only. Not `characterData`: typing "Fireball" into a trait
    // creates no reference — one appears as an element when a commit round-
    // trips through the codec. And not `attributes`: `RefNode.updateDOM`
    // re-asserts class and data on every reconcile, so that would fire on
    // every keystroke to tell us nothing.
    this.observer = new MutationObserver(() => this.onMutated());
    this.observer.observe(this.scope, { subtree: true, childList: true });
  }

  stop(): void {
    this.stopped = true;
    this.observer?.disconnect();
    this.observer = null;
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  /** One pass. Returns how many new references it asked about. */
  scan(): number {
    let offered = 0;
    for (const element of this.scope.querySelectorAll(".ref")) {
      if (this.seen.size >= this.limit) break;
      const token = readToken(element);
      const target = refToTarget(token);
      if (!target) continue;
      // Deduped on the reference, not the element: a condition named in three
      // traits is one lookup, and a rescan offers nothing at all.
      const key = `${target.path}/${target.slug}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      offered++;
      void this.source.lookup(token, { priority: "background" });
    }
    return offered;
  }

  private onMutated(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.defer();
    }, this.settleMs);
  }

  private defer(): void {
    this.cancelScheduled?.();
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = null;
      // An idle callback can still fire after `stop()` in some browsers.
      if (!this.stopped) this.scan();
    });
  }
}

/**
 * Idle time, with a plain timeout where `requestIdleCallback` is missing.
 *
 * A hidden tab throttles both, and that is the behaviour we want rather than
 * something to route around: there is no reason to warm definitions for a tab
 * nobody is looking at.
 */
const idleSchedule: Schedule = (run) => {
  const idle = (globalThis as { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof idle === "function") {
    const handle = idle(() => run(), { timeout: IDLE_TIMEOUT_MS });
    return () => (globalThis as { cancelIdleCallback?: typeof cancelIdleCallback })
      .cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(run, FALLBACK_MS);
  return () => clearTimeout(handle);
};
