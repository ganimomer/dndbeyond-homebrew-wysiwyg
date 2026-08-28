import { test } from "node:test";
import assert from "node:assert/strict";
import { AutosaveController, isDirty, type SaveState } from "./autosave.js";

// The controller is deliberately DOM-free, so these run on bare node:test with
// node's fake clock. Timings are tiny; the real debounce is 3 s.
const DEBOUNCE = 100;
const RETRY = 50;

/** A save thunk whose every call can be resolved or rejected by the test. */
function deferredSave() {
  const settlers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  let calls = 0;
  const save = () => {
    calls++;
    return new Promise<void>((resolve, reject) => settlers.push({ resolve, reject }));
  };
  return {
    save,
    get calls() {
      return calls;
    },
    /** Settles the oldest outstanding call. */
    finish: (error?: Error) => {
      const s = settlers.shift();
      assert.ok(s, "expected an outstanding save call");
      if (error) s.reject(error);
      else s.resolve();
    },
  };
}

function makeController(save: () => Promise<void>) {
  const states: SaveState[] = [];
  const controller = new AutosaveController(save, {
    debounceMs: DEBOUNCE,
    retryDelayMs: RETRY,
  });
  controller.onStateChange((s) => states.push(s));
  return { controller, states };
}

/** Lets pending promise callbacks run without advancing the clock. */
const settle = () => new Promise((r) => setImmediate(r));

test("a burst of edits coalesces into one save", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  t.mock.timers.tick(DEBOUNCE - 10);
  controller.request("header");
  t.mock.timers.tick(DEBOUNCE - 10);
  controller.request("traits");
  assert.equal(saver.calls, 0, "debounce not elapsed since the last edit");

  t.mock.timers.tick(DEBOUNCE);
  assert.equal(saver.calls, 1);
});

test("origins accumulate across sections and clear together on success", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  controller.request("traits");
  t.mock.timers.tick(DEBOUNCE);

  assert.equal(controller.state.status, "saving");
  assert.deepEqual([...controller.state.origins].sort(), ["header", "traits"]);

  saver.finish();
  await settle();
  assert.equal(controller.state.status, "idle");
  assert.equal(controller.state.origins.size, 0);
});

test("only one save is ever in flight; mid-flight edits trigger exactly one follow-up", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  t.mock.timers.tick(DEBOUNCE);
  assert.equal(saver.calls, 1);

  // Three more edits while the first request is still open.
  controller.request("traits");
  controller.request("actions");
  t.mock.timers.tick(DEBOUNCE);
  controller.request("traits");
  assert.equal(saver.calls, 1, "no concurrent save");

  saver.finish();
  await settle();
  assert.equal(saver.calls, 2, "exactly one follow-up for all three edits");
  assert.deepEqual([...controller.state.origins].sort(), ["actions", "traits"]);

  saver.finish();
  await settle();
  assert.equal(saver.calls, 2);
  assert.equal(controller.state.status, "idle");
});

test("a failure retries once silently, then surfaces as error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("traits");
  t.mock.timers.tick(DEBOUNCE);
  assert.equal(saver.calls, 1);

  saver.finish(new Error("network"));
  await settle();
  assert.notEqual(controller.state.status, "error", "first failure stays quiet");

  t.mock.timers.tick(RETRY);
  assert.equal(saver.calls, 2, "automatic retry fired");

  saver.finish(new Error("network"));
  await settle();
  assert.equal(controller.state.status, "error");
  assert.deepEqual([...controller.state.origins], ["traits"]);
});

test("retry() saves immediately and recovers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("traits");
  t.mock.timers.tick(DEBOUNCE);
  saver.finish(new Error("boom"));
  await settle();
  t.mock.timers.tick(RETRY);
  saver.finish(new Error("boom"));
  await settle();
  assert.equal(controller.state.status, "error");
  assert.equal(saver.calls, 2);

  controller.retry();
  assert.equal(saver.calls, 3, "retry skips the debounce");
  saver.finish();
  await settle();
  assert.equal(controller.state.status, "idle");
  assert.equal(controller.state.origins.size, 0);
});

test("a new edit clears the error state and is carried by the next save", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("traits");
  t.mock.timers.tick(DEBOUNCE);
  saver.finish(new Error("boom"));
  await settle();
  t.mock.timers.tick(RETRY);
  saver.finish(new Error("boom"));
  await settle();
  assert.equal(controller.state.status, "error");

  controller.request("header");
  assert.notEqual(controller.state.status, "error");
  t.mock.timers.tick(DEBOUNCE);
  assert.equal(saver.calls, 3);
  // The failed section's edit is still outstanding, so it rides this save too.
  assert.deepEqual([...controller.state.origins].sort(), ["header", "traits"]);
});

test("flush() short-circuits the debounce and resolves once saved", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  const flushed = flag(controller.flush());
  assert.equal(saver.calls, 1, "flush doesn't wait out the debounce");
  assert.equal(flushed.done, false);

  saver.finish();
  await settle();
  assert.equal(flushed.done, true);
});

test("flush() with nothing pending resolves without saving", async () => {
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  await controller.flush();
  assert.equal(saver.calls, 0);
});

test("flush() resolves rather than hanging when the save keeps failing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  const flushed = flag(controller.flush());
  saver.finish(new Error("offline"));
  await settle();
  t.mock.timers.tick(RETRY);
  saver.finish(new Error("offline"));
  await settle();

  assert.equal(controller.state.status, "error");
  assert.equal(flushed.done, true, "a dead network must not strand the caller");
});

test("isDirty covers the debounce, not just the request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  assert.equal(isDirty(controller.state), false, "nothing edited yet");

  controller.request("header");
  assert.equal(controller.state.status, "idle", "still waiting out the debounce");
  assert.equal(isDirty(controller.state), true, "…but the edit isn't saved");

  t.mock.timers.tick(DEBOUNCE);
  assert.equal(isDirty(controller.state), true, "in flight");

  saver.finish();
  await settle();
  assert.equal(isDirty(controller.state), false, "saved");
});

test("isDirty stays true while a save is failed and awaiting a retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saver = deferredSave();
  const { controller } = makeController(saver.save);

  controller.request("header");
  t.mock.timers.tick(DEBOUNCE);
  saver.finish(new Error("offline"));
  await settle();
  t.mock.timers.tick(RETRY);
  saver.finish(new Error("offline"));
  await settle();

  assert.equal(controller.state.status, "error");
  assert.equal(isDirty(controller.state), true);
});

/** Tracks whether a promise has resolved, without awaiting it. */
function flag(promise: Promise<void>) {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
}
