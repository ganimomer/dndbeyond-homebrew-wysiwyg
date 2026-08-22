import { test } from "node:test";
import assert from "node:assert/strict";
import { Dropped, TaskQueue } from "./task-queue.js";

/**
 * No DOM and no timers — the queue is about ordering and slots, so the tests
 * drive it with deferreds and settle them by hand.
 */

interface Deferred {
  /** Passed to `run`; records that it started. */
  task: () => Promise<string>;
  started: boolean;
  finish: (value?: string) => void;
  reject: (error: unknown) => void;
}

function deferred(name: string): Deferred {
  let finish!: (value: string) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<string>((resolve, rej) => {
    finish = resolve;
    reject = rej;
  });
  const d: Deferred = {
    started: false,
    task: () => {
      d.started = true;
      return promise;
    },
    finish: (value = name) => finish(value),
    reject,
  };
  return d;
}

/** Lets queued microtasks run, so `pump` has settled. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("runs up to the limit and no further", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const tasks = [deferred("a"), deferred("b"), deferred("c")];
  for (const t of tasks) queue.run(t.task);
  await flush();

  assert.deepEqual(tasks.map((t) => t.started), [true, true, false]);

  tasks[0]!.finish();
  await flush();
  assert.equal(tasks[2]!.started, true);
});

test("background work never takes the last slot", async () => {
  // The invariant the whole class exists for: a hover must not wait behind a
  // second's worth of preloads.
  const queue = new TaskQueue({ limit: 4, backgroundLimit: 3 });
  const background = [deferred("b1"), deferred("b2"), deferred("b3"), deferred("b4")];
  for (const t of background) queue.run(t.task, "background");
  await flush();

  assert.deepEqual(
    background.map((t) => t.started),
    [true, true, true, false],
    "background filled more than its share",
  );

  const hover = deferred("hover");
  queue.run(hover.task, "interactive");
  await flush();

  assert.equal(hover.started, true, "the reserved slot was not there when it was needed");
});

test("backgroundLimit is clamped so a slot is always reserved", async () => {
  // Even asked for outright, background may not fill the queue.
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 99 });
  const background = [deferred("b1"), deferred("b2")];
  for (const t of background) queue.run(t.task, "background");
  await flush();

  assert.deepEqual(background.map((t) => t.started), [true, false]);
});

test("background is never clamped to zero, or preloads would starve", async () => {
  // The reservation and "background makes progress" contradict each other
  // below two slots. Progress wins; the limit floor is what keeps both true.
  const queue = new TaskQueue({ limit: 1, backgroundLimit: 0 });
  const only = deferred("bg");
  queue.run(only.task, "background");
  await flush();

  assert.equal(only.started, true, "a background-only queue deadlocked");
});

/** Fills every slot, so what happens next is about ordering and not free space. */
async function saturate(queue: TaskQueue, slots: number): Promise<Deferred[]> {
  const blockers = Array.from({ length: slots }, (_, i) => deferred(`blocker${i}`));
  for (const b of blockers) queue.run(b.task, "interactive");
  await flush();
  return blockers;
}

test("interactive work queued later still starts before waiting background work", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const blockers = await saturate(queue, 2);
  const later = deferred("background");
  const sooner = deferred("interactive");
  queue.run(later.task, "background");
  queue.run(sooner.task, "interactive");
  await flush();

  blockers[0]!.finish();
  await flush();

  assert.equal(sooner.started, true, "interactive did not overtake");
  assert.equal(later.started, false);
  blockers[1]!.finish();
});

test("promote() lifts a queued task ahead of the background work before it", async () => {
  // What happens when the pointer catches up with a preload still in the queue.
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const blockers = await saturate(queue, 2);
  const first = deferred("first");
  const second = deferred("second");
  queue.run(first.task, "background");
  const queued = queue.run(second.task, "background");
  await flush();

  queued.promote();
  blockers[0]!.finish();
  await flush();

  assert.equal(second.started, true, "the promoted task did not overtake");
  assert.equal(first.started, false);
  blockers[1]!.finish();
});

test("promote() on a running task is a no-op", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const running = deferred("running");
  const handle = queue.run(running.task, "background");
  await flush();
  assert.equal(running.started, true);

  assert.doesNotThrow(() => handle.promote());
  running.finish("done");
  assert.equal(await handle.result, "done");
});

test("a rejecting task frees its slot and the rejection reaches the caller", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const bad = deferred("bad");
  const handle = queue.run(bad.task);
  const next = deferred("next");
  queue.run(next.task);
  await flush();

  bad.reject(new Error("boom"));
  await assert.rejects(handle.result, /boom/);
  await flush();

  assert.equal(next.started, true, "a rejection wedged the queue");
});

test("a task that throws synchronously also frees its slot", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const handle = queue.run(() => {
    throw new Error("sync boom");
  });
  const next = deferred("next");
  queue.run(next.task);

  await assert.rejects(handle.result, /sync boom/);
  await flush();

  assert.equal(next.started, true);
});

test("drop() discards queued work of that tier and leaves the rest alone", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const blockers = await saturate(queue, 2);
  const waitingBackground = deferred("bg");
  const waitingInteractive = deferred("ui");
  const dropped = queue.run(waitingBackground.task, "background");
  const kept = queue.run(waitingInteractive.task, "interactive");
  await flush();

  queue.drop("background");

  await assert.rejects(dropped.result, (error: unknown) => error instanceof Dropped);
  assert.equal(waitingBackground.started, false);

  for (const b of blockers) b.finish();
  await flush();

  assert.equal(waitingInteractive.started, true, "the other tier was dropped too");
  waitingInteractive.finish();
  assert.equal(await kept.result, "ui", "the surviving task should still settle normally");
});

test("drop() leaves a task that is already running to finish", async () => {
  const queue = new TaskQueue({ limit: 2, backgroundLimit: 1 });
  const running = deferred("running");
  const handle = queue.run(running.task, "background");
  await flush();
  assert.equal(running.started, true);

  queue.drop("background");
  running.finish("finished anyway");

  assert.equal(await handle.result, "finished anyway");
});
