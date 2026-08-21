/**
 * Where a dragged entry lands.
 *
 * Numbers rather than a browser, because this is the part that has to be exact:
 * an entry dropped one place off is a trait quietly in the wrong order, and the
 * author only finds out when they read the block back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropTargetAt, moveWithin, type ListGeometry } from "./item-drag.js";

/** Two sections: traits at 0–60 (three entries), actions at 80–120 (two). */
const BLOCK: ListGeometry[] = [
  {
    section: "traits",
    top: 0,
    bottom: 60,
    items: [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 40 },
      { top: 40, bottom: 60 },
    ],
  },
  {
    section: "actions",
    top: 80,
    bottom: 120,
    items: [
      { top: 80, bottom: 100 },
      { top: 100, bottom: 120 },
    ],
  },
];

test("above the first entry's middle is the head of the section", () => {
  assert.deepEqual(dropTargetAt(BLOCK, 4), { section: "traits", index: 0 });
});

test("past an entry's middle is the far side of it", () => {
  // The indicator flips as the pointer passes the middle, not as it leaves the
  // entry — which is what makes a short drag feel like it is following.
  assert.deepEqual(dropTargetAt(BLOCK, 9), { section: "traits", index: 0 });
  assert.deepEqual(dropTargetAt(BLOCK, 11), { section: "traits", index: 1 });
});

test("below the last entry is the foot of the section", () => {
  assert.deepEqual(dropTargetAt(BLOCK, 59), { section: "traits", index: 3 });
});

test("over another section is that section", () => {
  assert.deepEqual(dropTargetAt(BLOCK, 85), { section: "actions", index: 0 });
  assert.deepEqual(dropTargetAt(BLOCK, 119), { section: "actions", index: 2 });
});

test("between two sections is whichever is nearer", () => {
  // A pointer in the heading between them is in neither list. Answering
  // "nowhere" would blink the indicator out every time a drag crossed a
  // boundary, which is exactly when the author is watching it.
  assert.deepEqual(dropTargetAt(BLOCK, 65), { section: "traits", index: 3 });
  assert.deepEqual(dropTargetAt(BLOCK, 76), { section: "actions", index: 0 });
});

test("a block with no editable sections has nowhere to drop", () => {
  assert.equal(dropTargetAt([], 10), null);
});

test("an entry dropped either side of where it already is doesn't move", () => {
  // Both gaps it touches mean "leave it alone" — otherwise the smallest twitch
  // of the mouse would rewrite the section.
  assert.deepEqual(moveWithin(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
  assert.deepEqual(moveWithin(["a", "b", "c"], 1, 2), ["a", "b", "c"]);
});

test("an entry moves to the gap it was dropped in", () => {
  assert.deepEqual(moveWithin(["a", "b", "c"], 0, 2), ["b", "a", "c"]);
  assert.deepEqual(moveWithin(["a", "b", "c"], 0, 3), ["b", "c", "a"]);
  assert.deepEqual(moveWithin(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveWithin(["a", "b", "c"], 2, 1), ["a", "c", "b"]);
});
