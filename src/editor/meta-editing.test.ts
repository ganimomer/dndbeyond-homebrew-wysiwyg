import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";

// meta + meta-editing build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { metaContent } = await import("../preview/meta.js");
const { wireMetaControls } = await import("./meta-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

const SUBTYPES = (selected: string[]): SelectOption[] => [
  { value: "62", text: "shifter", selected: selected.includes("62") },
  { value: "1", text: "aarakocra", selected: selected.includes("1") },
  { value: "12", text: "elf", selected: selected.includes("12") },
];

function stubAdapter(subSelected: string[]) {
  const calls = { type: [] as string[], sub: [] as string[][] };
  const adapter = {
    typeOptions: (): SelectOption[] => [
      { value: "1", text: "Aberration", selected: false },
      { value: "16", text: "Undead", selected: true },
    ],
    subTypeOptions: (): SelectOption[] => SUBTYPES(subSelected),
    setType: (v: string) => calls.type.push(v),
    setSubTypes: (v: string[]) => calls.sub.push(v),
  };
  return { adapter, calls };
}

function scopeFor(subTypes: string[]): HTMLElement {
  const root = jsdom.window.document.createElement("div");
  root.append(...metaContent({ ...emptyMonster(), type: "Undead", subTypes }));
  return root;
}

test("type select: fills options, preselects current, commits on change", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const type = scope.querySelector<HTMLSelectElement>('select[data-meta="type"]')!;
  assert.deepEqual([...type.options].map((o) => o.text), ["Aberration", "Undead"]);
  assert.equal(type.value, "16");

  type.value = "1";
  type.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.type, ["1"]);
});

test("subtype datalist is filled with every tag label", () => {
  const scope = scopeFor(["shifter"]);
  const { adapter } = stubAdapter(["62"]);
  wireMetaControls(scope, adapter);

  const options = [...scope.querySelectorAll("datalist option")].map(
    (o) => (o as HTMLOptionElement).value,
  );
  assert.deepEqual(options, ["shifter", "aarakocra", "elf"]);
});

test("removing a chip commits the set without that tag's value", () => {
  const scope = scopeFor(["shifter"]);
  const { adapter, calls } = stubAdapter(["62"]);
  wireMetaControls(scope, adapter);

  scope.querySelector<HTMLButtonElement>(".meta-tag-remove")!.dispatchEvent(
    new jsdom.window.Event("click"),
  );
  assert.deepEqual(calls.sub, [[]]);
});

test("adding a known tag commits the augmented set", () => {
  const scope = scopeFor(["shifter"]);
  const { adapter, calls } = stubAdapter(["62"]);
  wireMetaControls(scope, adapter);

  const input = scope.querySelector<HTMLInputElement>(".meta-add")!;
  input.value = "elf";
  input.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.sub, [["62", "12"]]);
});

test("adding an unknown tag clears the input and commits nothing", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const input = scope.querySelector<HTMLInputElement>(".meta-add")!;
  input.value = "nonsense";
  input.dispatchEvent(new jsdom.window.Event("change"));
  assert.equal(input.value, "");
  assert.deepEqual(calls.sub, []);
});
