/**
 * A small two-tier concurrency limiter.
 *
 * Reference lookups come from two places with very different urgency: a hover,
 * where someone is waiting and watching, and a preload, where nobody is. This
 * keeps both off D&D Beyond's throat without letting the second get in the
 * first's way.
 *
 * **The priority mechanism is the reserved slot, not the sort order.** A plain
 * two-tier queue would still make a hover wait for one of the running preloads
 * to come back — and a redirect probe takes about a second, so that is exactly
 * the delay we are here to remove. Holding one slot back for interactive work
 * means a hover starts on the turn it is asked for, every time.
 */

export type Priority = "interactive" | "background";

/** Thrown into tasks that `drop()` discarded before they ever ran. */
export class Dropped extends Error {
  constructor() {
    super("task dropped");
    this.name = "Dropped";
  }
}

export interface Queued<T> {
  /** Settles with the task's result, or rejects with `Dropped`. */
  readonly result: Promise<T>;
  /** Move to the interactive tier. A no-op once the task is running. */
  promote(): void;
}

export interface TaskQueueOptions {
  /** Total tasks in flight, across both tiers. */
  limit?: number;
  /**
   * How many of those background work may occupy. The gap between this and
   * `limit` is the reserved slot described above; it must be at least one.
   */
  backgroundLimit?: number;
}

interface Waiter {
  task: () => Promise<unknown>;
  priority: Priority;
  settle: (value: Promise<unknown>) => void;
  fail: (error: unknown) => void;
}

/** Politeness, not a technical ceiling — dndbeyond.com is HTTP/2. */
const LIMIT = 4;
const BACKGROUND_LIMIT = 3;

export class TaskQueue {
  private readonly limit: number;
  private readonly backgroundLimit: number;
  private readonly waiting: Waiter[] = [];
  private running = 0;
  private backgroundRunning = 0;

  constructor(options: TaskQueueOptions = {}) {
    // Two slots is the floor: one for background to make progress in, one held
    // back for interactive work. Below that the two constraints contradict
    // each other and background would starve outright.
    this.limit = Math.max(2, options.limit ?? LIMIT);
    // Never let background fill every slot, however it was configured — that
    // is the one invariant this class exists for — but never let it reach zero
    // either, or a preload queue would sit there forever.
    this.backgroundLimit = Math.max(
      1,
      Math.min(options.backgroundLimit ?? BACKGROUND_LIMIT, this.limit - 1),
    );
  }

  run<T>(task: () => Promise<T>, priority: Priority = "interactive"): Queued<T> {
    let settle!: (value: Promise<unknown>) => void;
    let fail!: (error: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      settle = resolve as (value: Promise<unknown>) => void;
      fail = reject;
    });
    const entry: Waiter = { task, priority, settle, fail };
    this.waiting.push(entry);
    this.pump();
    return {
      result,
      promote: () => {
        const at = this.waiting.indexOf(entry);
        // Already running (or already finished) — there is nothing left to
        // reorder, and the task is not waiting on a slot any more.
        if (at === -1) return;
        entry.priority = "interactive";
        this.waiting.splice(at, 1);
        // Behind interactive work already queued, ahead of every background.
        const insertAt = this.waiting.findIndex((w) => w.priority === "background");
        this.waiting.splice(insertAt === -1 ? this.waiting.length : insertAt, 0, entry);
        this.pump();
      },
    };
  }

  /**
   * Discards *queued* tasks of a tier. Tasks already running are left to
   * finish — cancelling them would mean plumbing an AbortSignal through every
   * task, and the work is nearly done by then anyway.
   */
  drop(priority: Priority): void {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const waiter = this.waiting[i]!;
      if (waiter.priority !== priority) continue;
      this.waiting.splice(i, 1);
      waiter.fail(new Dropped());
    }
  }

  private pump(): void {
    while (this.running < this.limit) {
      const waiter = this.next();
      if (!waiter) return;
      this.start(waiter);
    }
  }

  /**
   * The next task to start: any waiting interactive one, in the order it was
   * asked for, and only then a background one — and that only if background
   * still has room.
   *
   * Scanning the queue in plain arrival order would not do. The reserved slot
   * stops preloads *filling* the queue, but it says nothing about a preload
   * that merely got in line first, and a hover behind fifteen of those would
   * wait exactly as long as if there were no priorities at all.
   */
  private next(): Waiter | null {
    const at = this.waiting.findIndex((waiter) => waiter.priority === "interactive");
    if (at !== -1) return this.waiting.splice(at, 1)[0]!;
    if (this.backgroundRunning >= this.backgroundLimit) return null;
    const background = this.waiting.findIndex((waiter) => waiter.priority === "background");
    return background === -1 ? null : this.waiting.splice(background, 1)[0]!;
  }

  private start(waiter: Waiter): void {
    this.running++;
    if (waiter.priority === "background") this.backgroundRunning++;
    let started: Promise<unknown>;
    try {
      started = waiter.task();
    } catch (error) {
      // A task that throws synchronously must still free its slot, or one bad
      // caller wedges the queue for the rest of the session.
      started = Promise.reject(error);
    }
    waiter.settle(started);
    void started
      .catch(() => {
        // The rejection belongs to whoever holds `result`; swallowing it here
        // only stops an unhandled-rejection warning on our own bookkeeping.
      })
      .finally(() => {
        this.running--;
        if (waiter.priority === "background") this.backgroundRunning--;
        this.pump();
      });
  }
}
