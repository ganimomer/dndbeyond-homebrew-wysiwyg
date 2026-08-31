import { test } from "node:test";
import assert from "node:assert/strict";
import { LearnedReferenceIds, type KeyValueArea } from "./reference-id-store.js";
import type { ReferenceTarget } from "./ddb-reference-map.js";

/**
 * Driven against a plain object rather than `browser.storage.local`, which is
 * the point of the `KeyValueArea` seam — the polyfill throws outside an
 * extension context, so nothing here may reach for it.
 */

const FIREBALL: ReferenceTarget = { path: "spells", slug: "fireball" };
const SHIELD: ReferenceTarget = { path: "spells", slug: "shield" };

function fakeArea(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const writes: Array<Record<string, unknown>> = [];
  const area: KeyValueArea = {
    async get(key) {
      return key in store ? { [key]: store[key] } : {};
    },
    async set(items) {
      writes.push(items);
      Object.assign(store, items);
    },
  };
  return { area, writes, store };
}

const stored = (ids: Record<string, number>) => ({ "microbrewery.referenceIds": { v: 1, ids } });

test("an id survives a round trip through storage", async () => {
  const { area, store } = fakeArea();
  const first = new LearnedReferenceIds(area, { writeDelayMs: 0 });
  await first.ready;
  first.remember(FIREBALL, 2019);
  await first.flush();

  const second = new LearnedReferenceIds(area, { writeDelayMs: 0 });
  await second.ready;

  assert.equal(second.get(FIREBALL), 2019);
  assert.deepEqual(store["microbrewery.referenceIds"], { v: 1, ids: { "spells/fireball": 2019 } });
});

test("a reference we have never seen reads as null, not undefined", async () => {
  const { area } = fakeArea();
  const ids = new LearnedReferenceIds(area);
  await ids.ready;

  assert.equal(ids.get(FIREBALL), null);
});

test("a sweep that learns many ids writes once", async () => {
  // A preload pass resolves fifteen spells in a few seconds; that should cost
  // one write, not fifteen.
  const { area, writes } = fakeArea();
  const ids = new LearnedReferenceIds(area, { writeDelayMs: 50 });
  await ids.ready;

  for (let i = 0; i < 15; i++) ids.remember({ path: "spells", slug: `s${i}` }, 1000 + i);
  await ids.flush();

  assert.equal(writes.length, 1);
  assert.equal(Object.keys((writes[0]!["microbrewery.referenceIds"] as { ids: object }).ids).length, 15);
});

test("remembering the same id again does not dirty the store", async () => {
  const { area, writes } = fakeArea();
  const ids = new LearnedReferenceIds(area, { writeDelayMs: 0 });
  await ids.ready;

  ids.remember(FIREBALL, 2019);
  await ids.flush();
  ids.remember(FIREBALL, 2019);
  await ids.flush();

  assert.equal(writes.length, 1);
});

test("flush() with nothing to say writes nothing", async () => {
  const { area, writes } = fakeArea();
  const ids = new LearnedReferenceIds(area, { writeDelayMs: 0 });
  await ids.ready;

  await ids.flush();

  assert.deepEqual(writes, []);
});

test("a table from an older version is discarded rather than migrated", async () => {
  const { area } = fakeArea({ "microbrewery.referenceIds": { v: 0, ids: { "spells/fireball": 1 } } });
  const ids = new LearnedReferenceIds(area);
  await ids.ready;

  assert.equal(ids.get(FIREBALL), null);
});

test("garbage in storage loads as empty without throwing", async () => {
  for (const junk of ["nonsense", 42, null, { v: 1 }, { v: 1, ids: "no" }]) {
    const { area } = fakeArea({ "microbrewery.referenceIds": junk });
    const ids = new LearnedReferenceIds(area);
    await ids.ready;
    assert.equal(ids.get(FIREBALL), null, `survived ${JSON.stringify(junk)}`);
  }
});

test("a non-integer id in storage is ignored", async () => {
  const { area } = fakeArea(stored({ "spells/fireball": 1.5, "spells/shield": 2 } as never));
  const ids = new LearnedReferenceIds(area);
  await ids.ready;

  assert.equal(ids.get(FIREBALL), null);
  assert.equal(ids.get(SHIELD), 2);
});

test("a storage read that rejects leaves an empty but usable store", async () => {
  const area: KeyValueArea = {
    get: () => Promise.reject(new Error("no port")),
    set: async () => {},
  };
  const ids = new LearnedReferenceIds(area);
  await ids.ready;

  assert.equal(ids.get(FIREBALL), null);
  assert.doesNotThrow(() => ids.remember(FIREBALL, 2019));
  assert.equal(ids.get(FIREBALL), 2019);
});

test("a storage write that rejects is swallowed", async () => {
  // Quota, or a browser mid-shutdown. A cache must never break a hover.
  const area: KeyValueArea = {
    get: async () => ({}),
    set: () => Promise.reject(new Error("QUOTA_BYTES exceeded")),
  };
  const ids = new LearnedReferenceIds(area, { writeDelayMs: 0 });
  await ids.ready;
  ids.remember(FIREBALL, 2019);

  await assert.doesNotReject(ids.flush());
  assert.equal(ids.get(FIREBALL), 2019, "the in-memory copy should survive a failed write");
});

test("over the cap, the oldest go and the newest stay", async () => {
  const { area, writes } = fakeArea();
  const ids = new LearnedReferenceIds(area, { cap: 3, writeDelayMs: 0 });
  await ids.ready;

  for (const slug of ["a", "b", "c", "d", "e"]) {
    ids.remember({ path: "spells", slug }, slug.charCodeAt(0));
  }
  await ids.flush();

  const written = (writes[0]!["microbrewery.referenceIds"] as { ids: Record<string, number> }).ids;
  assert.deepEqual(Object.keys(written), ["spells/c", "spells/d", "spells/e"]);
});
