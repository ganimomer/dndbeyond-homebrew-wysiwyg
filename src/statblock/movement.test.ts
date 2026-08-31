import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSpeed, movementText, orderMovements, walkSpeed } from "./movement.js";
import { emptyMonster, type Movement } from "./model.js";

const withMovements = (movements: Movement[]) => ({ ...emptyMonster(), movements });

test("a walk speed defaults to 30 ft.", () => {
  assert.equal(defaultSpeed(withMovements([]), "Walk"), 30);
  // Even for a creature that already flies — walking is its own baseline.
  assert.equal(defaultSpeed(withMovements([{ type: "Fly", speed: 60 }]), "Walk"), 30);
});

test("other speeds default to how fast the creature walks", () => {
  const monster = withMovements([{ type: "Walk", speed: 40 }]);
  assert.equal(defaultSpeed(monster, "Climb"), 40);
  assert.equal(defaultSpeed(monster, "Fly"), 40);
  assert.equal(defaultSpeed(monster, "Swim"), 40);
});

test("other speeds fall back to 30 ft. when the creature can't walk", () => {
  const monster = withMovements([{ type: "Swim", speed: 60 }]);
  assert.equal(walkSpeed(monster), undefined);
  assert.equal(defaultSpeed(monster, "Fly"), 30);
});

test("walk sorts first, the rest keep DDB's order", () => {
  const ordered = orderMovements([
    { type: "Climb", speed: 40 },
    { type: "Walk", speed: 30 },
    { type: "Fly", speed: 60 },
  ]);
  assert.deepEqual(ordered.map((m) => m.type), ["Walk", "Climb", "Fly"]);
});

test("movementText prints walk bare, labels the rest, and appends notes", () => {
  assert.equal(movementText({ type: "Walk", speed: 40 }), "40 ft.");
  assert.equal(movementText({ type: "Climb", speed: 40 }), "Climb 40 ft.");
  assert.equal(movementText({ type: "Fly", speed: 60, note: "hover" }), "Fly 60 ft. (hover)");
});
