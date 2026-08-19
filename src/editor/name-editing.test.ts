import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { Monster } from "../statblock/model.js";

// name-row probes `contentEditable` at module scope; install jsdom globals first.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { nameRow } = await import("../preview/name-row.js");
const { wireName } = await import("./name-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

function setup(name = "Vampire") {
  const monster: Monster = { ...emptyMonster(), name };
  const scope = jsdom.window.document.createElement("div");
  scope.append(nameRow(monster));
  // The name must be in the document for focus/blur to behave.
  jsdom.window.document.body.append(scope);

  const calls: string[] = [];
  wireName(scope, monster, { onCommit: (value) => calls.push(value) });

  const field = scope.querySelector<HTMLElement>(".name")!;
  return { scope, field, calls, monster };
}

const blur = (node: HTMLElement) =>
  node.dispatchEvent(new jsdom.window.Event("blur", { bubbles: false }));
const press = (node: HTMLElement, key: string) =>
  node.dispatchEvent(
    new jsdom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
const type = (node: HTMLElement, text: string) => {
  node.textContent = text;
  node.dispatchEvent(new jsdom.window.Event("input", { bubbles: true }));
};

test("blur commits the edited name", () => {
  const { field, calls } = setup();

  type(field, "Vampire Spawn");
  blur(field);

  assert.deepEqual(calls, ["Vampire Spawn"]);
});

test("Enter commits without leaving a newline in the name", () => {
  const { field, calls } = setup();

  type(field, "Vampire Lord");
  const event = new jsdom.window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(event);
  // Enter must not reach the contenteditable, or it inserts a line break.
  assert.equal(event.defaultPrevented, true);

  blur(field); // Enter commits by blurring; jsdom won't do that for us
  assert.deepEqual(calls, ["Vampire Lord"]);
  assert.ok(!field.textContent!.includes("\n"));
});

test("Escape reverts to the stored name and commits nothing", () => {
  const { field, calls } = setup("Vampire");

  type(field, "Half-typed nonsen");
  press(field, "Escape");

  assert.equal(field.textContent, "Vampire");
  blur(field);
  assert.deepEqual(calls, []);
});

test("an unchanged blur commits nothing", () => {
  // Focusing and tabbing away must not spin autosave.
  const { field, calls } = setup("Vampire");

  blur(field);

  assert.deepEqual(calls, []);
});

test("whitespace and pasted newlines collapse to a single-line name", () => {
  const { field, calls } = setup();

  type(field, "  Vampire\nof the\n  Mists  ");
  blur(field);

  assert.deepEqual(calls, ["Vampire of the Mists"]);
});

test("the committed text is normalized in place, so the next blur is a no-op", () => {
  const { field, calls } = setup();

  type(field, "  Vampire Spawn  ");
  blur(field);
  blur(field);

  assert.equal(field.textContent, "Vampire Spawn");
  assert.deepEqual(calls, ["Vampire Spawn"]);
});

test("an empty name renders the placeholder, and typing clears it", () => {
  const { field } = setup("");

  assert.equal(field.textContent, "");
  assert.ok(field.classList.contains("is-empty"), "empty name should show the prompt");

  type(field, "V");
  assert.ok(!field.classList.contains("is-empty"));

  type(field, "");
  assert.ok(field.classList.contains("is-empty"), "prompt should come back when cleared");
});

test("clearing a name commits an empty string rather than the old one", () => {
  const { field, calls } = setup("Vampire");

  type(field, "");
  blur(field);

  assert.deepEqual(calls, [""]);
});

test("the field carries the focus key the panel restores to", () => {
  const { field } = setup();

  assert.equal(field.dataset.focusKey, "name");
  assert.equal(field.getAttribute("aria-label"), "Creature name");
  assert.ok(field.isContentEditable || field.getAttribute("contenteditable"));
});
