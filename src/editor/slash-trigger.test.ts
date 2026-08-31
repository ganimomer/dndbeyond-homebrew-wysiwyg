import { test } from "node:test";
import assert from "node:assert/strict";
import { slashCommandLength, slashQuery } from "./slash-trigger.js";

/**
 * Mostly a list of the slashes that must *not* open a menu. Stat-block prose is
 * full of them.
 */

test("a slash on its own opens the menu with nothing typed", () => {
  // Not null: there is a menu, it just isn't narrowed yet.
  assert.equal(slashQuery("/"), "");
  assert.equal(slashQuery("The target is /"), "");
});

test("what follows the slash is the query", () => {
  assert.equal(slashQuery("/con"), "con");
  assert.equal(slashQuery("The target is /cond"), "cond");
  assert.equal(slashQuery("/weapon-prop"), "weapon-prop");
});

test("a space after the query closes the menu", () => {
  // Which is the whole dismissal story for "I meant to type a slash".
  assert.equal(slashQuery("/con "), null);
  assert.equal(slashQuery("/ "), null);
});

test("a slash mid-word is not a command", () => {
  // The ones that actually occur: rates, ranges, and alternatives.
  assert.equal(slashQuery("1d6/round"), null);
  assert.equal(slashQuery("60/120"), null);
  assert.equal(slashQuery("Melee/Ranged"), null);
});

test("only the last slash counts", () => {
  assert.equal(slashQuery("60/120 ft. /con"), "con");
});

test("ordinary prose opens nothing", () => {
  assert.equal(slashQuery(""), null);
  assert.equal(slashQuery("The vampire makes two attacks."), null);
});

test("the command is the query plus its slash", () => {
  assert.equal(slashCommandLength(""), 1);
  assert.equal(slashCommandLength("con"), 4);
});
