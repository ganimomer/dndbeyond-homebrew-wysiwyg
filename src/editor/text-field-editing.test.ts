import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { Monster } from "../statblock/model.js";
import type { TextField } from "../preview/text-line.js";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { render55e } = await import("../preview/render-55e.js");
const { wireTextFields } = await import("./text-field-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

const click = (el: Element) => el.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));
const change = (el: Element) => el.dispatchEvent(new jsdom.window.Event("change"));

function handlers() {
  const calls = { committed: [] as Array<[TextField, string]>, cleared: [] as TextField[] };
  return {
    calls,
    handlers: {
      onCommit: (field: TextField, value: string) => calls.committed.push([field, value]),
      onClear: (field: TextField) => calls.cleared.push(field),
    },
  };
}

test("typing a value commits it trimmed, on change only", () => {
  const monster: Monster = { ...emptyMonster(), languages: "Common" };
  const block = render55e(monster);
  const { handlers: h, calls } = handlers();
  wireTextFields(block, monster, h);

  const input = block.querySelector<HTMLInputElement>('.sb-text[data-field="languages"] input')!;
  input.value = "Common, Elvish  ";
  change(input);

  assert.deepEqual(calls.committed, [["languages", "Common, Elvish"]]);
});

test("re-committing the value it already has writes nothing", () => {
  const monster: Monster = { ...emptyMonster(), gear: "Longsword" };
  const block = render55e(monster);
  const { handlers: h, calls } = handlers();
  wireTextFields(block, monster, h);

  change(block.querySelector('.sb-text[data-field="gear"] input')!);

  assert.deepEqual(calls.committed, []);
});

test("the ✕ clears the field, which is what takes the row off the block", () => {
  const monster: Monster = { ...emptyMonster(), gear: "Longsword" };
  const block = render55e(monster);
  const { handlers: h, calls } = handlers();
  wireTextFields(block, monster, h);

  click(block.querySelector('.sb-text[data-field="gear"] .sb-text-clear')!);

  assert.deepEqual(calls.cleared, ["gear"]);
});

test("a revealed-but-empty field can be dismissed the same way", () => {
  const monster = emptyMonster();
  const block = render55e(monster, { revealed: new Set(["gear"]) });
  const { handlers: h, calls } = handlers();
  wireTextFields(block, monster, h);

  click(block.querySelector('.sb-text[data-field="gear"] .sb-text-clear')!);

  assert.deepEqual(calls.cleared, ["gear"]);
  assert.deepEqual(calls.committed, []);
});
