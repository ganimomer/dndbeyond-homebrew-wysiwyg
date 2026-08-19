/**
 * Debounced autosave with single-flight and retry.
 *
 * Edits made in the overlay land in DDB's form immediately; this decides *when*
 * that form gets persisted and tracks who's waiting, so the UI can show a
 * spinner on the section being saved. It knows nothing about the DOM or D&D
 * Beyond — it takes a `save` thunk — which is what makes it testable headlessly.
 *
 * The whole form posts at once, so a save is never "a section's save": several
 * sections can ride one request. `origins` is therefore a *set* of who asked,
 * and they all clear together when the request lands.
 *
 * Saves are slow (~5.5 s against DDB) and never run concurrently: a request
 * arriving mid-flight is remembered and fires one follow-up once the current
 * one settles, so bursts can't stack up requests that would race each other
 * writing the same form.
 */

/** Which part of the stat block an edit came from — drives spinner placement. */
export type SaveOrigin = string;

export type SaveStatus = "idle" | "saving" | "error";

export interface SaveState {
  status: SaveStatus;
  /** Who is waiting on the current save (empty when idle). */
  origins: ReadonlySet<SaveOrigin>;
}

export interface AutosaveOptions {
  /** How long to coalesce edits before saving. */
  debounceMs?: number;
  /** How long to wait before the one automatic retry. */
  retryDelayMs?: number;
}

/** Coalesce window for edits. Long enough to batch a burst of typing. */
const DEBOUNCE_MS = 3000;
/** Delay before the single automatic retry, after which we surface the error. */
const RETRY_DELAY_MS = 2000;

export class AutosaveController {
  private readonly debounceMs: number;
  private readonly retryDelayMs: number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(state: SaveState) => void>();

  /** Origins whose edits aren't persisted yet. */
  private pending = new Set<SaveOrigin>();
  /** Origins riding the in-flight request; empty when nothing is in flight. */
  private inFlight = new Set<SaveOrigin>();
  private saving = false;
  private failed = false;
  /** Set when an edit arrives mid-flight, so we save once more on settle. */
  private again = false;
  /** Whether the current failure has already burned its automatic retry. */
  private retried = false;
  /** Resolvers for `flush()` callers waiting on the form to be clean. */
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly save: () => Promise<void>,
    options: AutosaveOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  }

  /** Records an edit from `origin` and (re)starts the debounce. */
  request(origin: SaveOrigin): void {
    this.pending.add(origin);
    // A new edit supersedes a failed one — it'll be carried by the next save.
    this.failed = false;
    this.retried = false;
    this.restartTimer();
    this.emit();
  }

  /** Retries after a failure, immediately. */
  retry(): void {
    if (!this.failed) return;
    this.failed = false;
    this.retried = false;
    this.clearTimer();
    void this.run();
    this.emit();
  }

  /**
   * Saves any pending edits now, skipping the debounce, and resolves once
   * nothing is left in flight. Used when closing the overlay or leaving the
   * page, so a debounced edit isn't dropped.
   */
  flush(): Promise<void> {
    this.clearTimer();
    if (this.pending.size > 0 && !this.saving) void this.run();
    if (!this.saving && this.pending.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  get state(): SaveState {
    return {
      status: this.saving ? "saving" : this.failed ? "error" : "idle",
      // While saving, the spinner belongs on whoever is riding the request;
      // a failure keeps flagging them so the retry affordance has a home.
      origins: new Set(this.saving || this.failed ? this.inFlight : this.pending),
    };
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cancels any scheduled save and drops subscribers. */
  destroy(): void {
    this.clearTimer();
    this.listeners.clear();
    this.releaseWaiters();
  }

  private restartTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.debounceMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    // Single-flight: remember that more work arrived and let the current save
    // pick it up when it settles.
    if (this.saving) {
      this.again = true;
      return;
    }
    if (this.pending.size === 0) return;

    this.inFlight = this.pending;
    this.pending = new Set();
    this.saving = true;
    this.emit();

    try {
      await this.save();
      this.inFlight = new Set();
      this.failed = false;
      this.retried = false;
    } catch {
      // Put the origins back so the next attempt carries them, but keep them in
      // `inFlight` too — that's where the error indicator is anchored.
      for (const origin of this.inFlight) this.pending.add(origin);
      if (this.retried) {
        this.failed = true;
      } else {
        this.retried = true;
        this.again = true;
      }
    } finally {
      this.saving = false;
    }

    if (this.again && !this.failed) {
      this.again = false;
      // A retry waits out its backoff; a plain follow-up goes right away.
      if (this.retried && this.pending.size > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.run();
        }, this.retryDelayMs);
        this.emit();
        return;
      }
      await this.run();
      return;
    }
    this.again = false;

    this.emit();
    if (!this.saving && !this.failed && this.pending.size === 0) this.releaseWaiters();
    // A terminal failure must not strand a flush() caller forever.
    if (this.failed) this.releaseWaiters();
  }

  private releaseWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }
}
