import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageAdapter } from "../adapter/types.js";
import { emptyMonster, type Monster } from "../statblock/model.js";
import { EditorStore } from "./store.js";
import { reveal } from "./session.js";

/**
 * A page that reads back whatever the test puts in it. `notify` stands in for
 * D&D Beyond's form mutating under us.
 */
function stubPage(monster: Monster) {
  let current = monster;
  let onChange: (() => void) | null = null;
  const adapter = {
    read: () => current,
    observe: (fn: () => void) => {
      onChange = fn;
      return () => {
        onChange = null;
      };
    },
  } as unknown as PageAdapter;

  return {
    adapter,
    /** Replaces the form's contents and tells the store, as observe() would. */
    put(next: Monster) {
      current = next;
      onChange?.();
    },
    get observed() {
      return onChange !== null;
    },
  };
}

const armored = (): Monster => ({
  ...emptyMonster(),
  abilities: { ...emptyMonster().abilities, dex: 14 },
  armorClass: { value: 16, type: "natural armor" },
});

test("reads the creature on start and announces it", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);
  const changes: string[] = [];
  store.subscribe((change) => changes.push(change));

  store.start();

  assert.equal(store.getMonster()?.armorClass.value, 16);
  assert.deepEqual(changes, ["monster"]);
});

test("takes the armor's worth from the form as it was first found", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);

  store.start();

  // 16 total, of which 10 + DEX(+2) is unarmored: the armor is worth 4.
  assert.equal(store.getSession().armorBonus, 4);

  // A later edit must not re-anchor it — the figure to preserve is the one the
  // creature arrived with.
  page.put({ ...armored(), armorClass: { value: 20, type: "plate" } });
  assert.equal(store.getSession().armorBonus, 4);
});

test("session updates land synchronously, so a click can re-render inside itself", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);
  store.start();

  const changes: string[] = [];
  store.subscribe((change) => changes.push(change));
  store.update({ pendingFocus: "hp:average" });

  assert.deepEqual(changes, ["session"]);
  assert.equal(store.getSession().pendingFocus, "hp:average");
});

test("forgets a reveal once the field has a value of its own", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);
  store.start();

  store.update({ revealed: reveal(store.getSession(), "languages") });
  assert.equal(store.getSession().revealed.has("languages"), true);

  // The user types something into it: the row now renders on its own merit, so
  // the reveal has nothing left to do.
  page.put({ ...armored(), languages: "Common" });

  assert.equal(store.getSession().revealed.has("languages"), false);
});

test("a queued focus is spent by the render that takes it", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);
  store.start();
  store.update({ pendingFocus: "speed:Fly" });

  assert.equal(store.takePendingFocus(), "speed:Fly");
  assert.equal(store.takePendingFocus(), null);
});

test("stops watching the form when stopped", () => {
  const page = stubPage(armored());
  const store = new EditorStore(page.adapter);
  store.start();
  assert.equal(page.observed, true);

  store.stop();

  assert.equal(page.observed, false);
});
