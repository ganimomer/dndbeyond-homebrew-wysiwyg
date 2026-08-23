/**
 * The lookup's own state machine: who is told what, and how long the frame
 * stays mounted after it has been dismissed.
 *
 * The delay is the whole reason this is a machine rather than a boolean. The
 * frame leaves on a transition, and something has to unmount it afterwards —
 * so `closing` is a real state, and an author who has asked not to see things
 * move must not spend a quarter of a second in it.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { kindByMacro } from "../../adapter/reference-catalog.js";
import { LookupController, type LookupState } from "./lookup-context.js";
import { motionOk } from "./motion.js";

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const SPELLS = kindByMacro("spells")!;
const FIREBALL = { name: "Fireball", slug: "fireball", id: 2618887 };

/**
 * Reports what the author's system says about motion, for one test.
 *
 * Built rather than wrapped: jsdom implements no `matchMedia` at all, which is
 * why `motionOk` calls it optionally and treats a missing answer as "motion is
 * fine" — the same thing an old browser would say.
 */
function prefersReducedMotion(t: TestContext, reduce: boolean) {
  const real = window.matchMedia;
  t.after(() => {
    window.matchMedia = real;
  });
  window.matchMedia = ((query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function watch(controller: LookupController) {
  const seen: Array<LookupState["phase"] | null> = [];
  controller.subscribe((state) => seen.push(state?.phase ?? null));
  return seen;
}

function request(overrides: Partial<Parameters<LookupController["open"]>[0]> = {}) {
  return {
    kind: SPELLS,
    query: "fireb",
    onPick: () => {},
    onCancel: () => {},
    ...overrides,
  };
}

test("a lookup is open, then closing, then gone", async (t) => {
  prefersReducedMotion(t, false);
  const controller = new LookupController();
  const seen = watch(controller);

  controller.open(request());
  controller.pick(FIREBALL);

  // Still mounted, and told to leave: the frame fades while the block slides
  // back, rather than after it.
  assert.deepEqual(seen, [null, "open", "closing"]);

  await settle(400);
  assert.deepEqual(seen, [null, "open", "closing", null]);
});

test("an author who asked not to see things move doesn't wait for them", async (t) => {
  prefersReducedMotion(t, true);
  assert.equal(motionOk(), false);

  const controller = new LookupController();
  const seen = watch(controller);
  controller.open(request());
  controller.cancel();
  await settle();

  assert.deepEqual(seen, [null, "open", "closing", null], "gone on the next tick");
});

test("picking tells the asker what was picked, once", async (t) => {
  const controller = new LookupController();
  const picks: unknown[] = [];
  controller.open(request({ onPick: (pick) => picks.push(pick) }));

  controller.pick(FIREBALL);
  // A second row can't be clicked: the page has been dismissed.
  controller.pick({ name: "Fire Bolt", slug: "fire-bolt", id: 1 });

  assert.deepEqual(picks, [FIREBALL]);
});

test("closing tells the asker instead, so the reference is abandoned", async (t) => {
  const controller = new LookupController();
  let cancelled = 0;
  let picked = 0;
  controller.open(request({ onPick: () => (picked += 1), onCancel: () => (cancelled += 1) }));

  controller.cancel();
  controller.cancel();

  assert.deepEqual([picked, cancelled], [0, 1]);
});

test("a closed overlay leaves nothing waiting to fire", async (t) => {
  prefersReducedMotion(t, false);
  const controller = new LookupController();
  const seen = watch(controller);

  controller.open(request());
  controller.cancel();
  controller.stop();
  await settle(400);

  assert.deepEqual(seen, [null, "open", "closing"], "the unmount never lands");
});
