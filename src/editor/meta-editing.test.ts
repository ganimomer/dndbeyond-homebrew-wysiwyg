import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";

// meta + meta-editing build DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { metaContent } = await import("../preview/meta.js");
const { visibleMeta } = await import("../preview/optional-fields.js");
const { wireMetaControls } = await import("./meta-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

const SUBTYPES = (selected: string[]): SelectOption[] => [
  { value: "62", text: "shifter", selected: selected.includes("62") },
  { value: "1", text: "aarakocra", selected: selected.includes("1") },
  { value: "12", text: "elf", selected: selected.includes("12") },
];

function stubAdapter(subSelected: string[]) {
  const calls = {
    size: [] as string[],
    type: [] as string[],
    sub: [] as string[][],
    alignment: [] as string[],
  };
  const adapter = {
    sizeOptions: (): SelectOption[] => [
      { value: "3", text: "Small", selected: false },
      { value: "4", text: "Medium", selected: true },
    ],
    typeOptions: (): SelectOption[] => [
      { value: "1", text: "Aberration", selected: false },
      { value: "16", text: "Undead", selected: true },
    ],
    subTypeOptions: (): SelectOption[] => SUBTYPES(subSelected),
    alignmentOptions: (): SelectOption[] => [
      { value: "1", text: "Lawful Good", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
    setSize: (v: string) => calls.size.push(v),
    setType: (v: string) => calls.type.push(v),
    setSubTypes: (v: string[]) => calls.sub.push(v),
    setAlignment: (v: string) => calls.alignment.push(v),
  };
  return { adapter, calls };
}

/**
 * The meta line for a monster, with every slot showing. Blank slots are only on
 * the block when the user has added them, so the tests reveal them explicitly.
 */
function scopeFor(subTypes: string[], overrides: Partial<Monster> = {}): HTMLElement {
  const monster = { ...emptyMonster(), type: "Undead", subTypes, ...overrides };
  const revealed = new Set(["size", "type", "subTypes", "alignment"] as const);
  const root = jsdom.window.document.createElement("div");
  root.append(...metaContent(monster, visibleMeta(monster, revealed)));
  return root;
}

test("size select: fills options, preselects current, commits on change", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const size = scope.querySelector<HTMLSelectElement>('select[data-meta="size"]')!;
  assert.deepEqual([...size.options].map((o) => o.text), ["Small", "Medium"]);
  assert.equal(size.value, "4");

  // The commit carries DDB's option *value*, not the label.
  size.value = "3";
  size.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.size, ["3"]);
});

test("alignment select: fills options, preselects current, commits on change", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const alignment = scope.querySelector<HTMLSelectElement>('select[data-meta="alignment"]')!;
  assert.deepEqual([...alignment.options].map((o) => o.text), ["Lawful Good", "Unaligned"]);
  assert.equal(alignment.value, "10");

  alignment.value = "1";
  alignment.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.alignment, ["1"]);
});

test("a blank size or alignment still renders a placeholder dropdown", () => {
  // The old meta line dropped the text node entirely, leaving no way to set a
  // blank field from the preview; every slot must now hold a control.
  const scope = scopeFor([], { size: "", alignment: "" });

  for (const kind of ["size", "alignment"]) {
    const select = scope.querySelector<HTMLSelectElement>(`select[data-meta="${kind}"]`);
    assert.ok(select, `expected a ${kind} select`);
    assert.ok(select!.classList.contains("is-placeholder"), `${kind} should be dimmed`);
  }

  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);
  const size = scope.querySelector<HTMLSelectElement>('select[data-meta="size"]')!;
  size.value = "3";
  size.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.size, ["3"]);
});

test("picking the em-dash option clears the slot, taking it off the block", () => {
  // How a single-select field is dismissed: DDB's own "nothing chosen" option
  // commits "", and a slot with no value isn't rendered next time round.
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, {
    ...adapter,
    sizeOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "4", text: "Medium", selected: true },
    ],
  });

  const size = scope.querySelector<HTMLSelectElement>('select[data-meta="size"]')!;
  size.value = "";
  size.dispatchEvent(new jsdom.window.Event("change"));
  assert.deepEqual(calls.size, [""]);
});

test("a blank field keeps its prompt wording on DDB's em-dash option", () => {
  // DDB's "nothing chosen" option is labelled "—". Filling the dropdown must not
  // let that dash replace the seeded "Alignment…" prompt.
  const scope = scopeFor([], { alignment: "" });
  const { adapter } = stubAdapter([]);
  wireMetaControls(scope, {
    ...adapter,
    alignmentOptions: () => [
      { value: "", text: "—", selected: true },
      { value: "1", text: "Lawful Good", selected: false },
    ],
  });

  const alignment = scope.querySelector<HTMLSelectElement>('select[data-meta="alignment"]')!;
  assert.equal(alignment.options[alignment.selectedIndex]?.text, "Alignment…");
  assert.deepEqual([...alignment.options].map((o) => o.text), ["Alignment…", "Lawful Good"]);
});

test("a populated field leaves every option label alone", () => {
  const scope = scopeFor([]);
  const { adapter } = stubAdapter([]);
  wireMetaControls(scope, {
    ...adapter,
    alignmentOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
  });

  const alignment = scope.querySelector<HTMLSelectElement>('select[data-meta="alignment"]')!;
  assert.deepEqual([...alignment.options].map((o) => o.text), ["—", "Unaligned"]);
});

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

  scope.querySelector<HTMLButtonElement>(".sb-chip-remove")!.dispatchEvent(
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
