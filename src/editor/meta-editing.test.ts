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

/** The labels a wired slot's picker offers, in order. */
const options = (scope: ParentNode, kind: string): string[] =>
  [...scope.querySelectorAll(`[data-meta="${kind}"] .cp-option`)].map((n) => n.textContent ?? "");

/** The option a wired slot's picker marks as the value the field holds. */
const chosen = (scope: ParentNode, kind: string): string[] =>
  [...scope.querySelectorAll(`[data-meta="${kind}"] .cp-option`)]
    .filter((n) => n.getAttribute("aria-selected") === "true")
    .map((n) => n.textContent ?? "");

/** Clicks the picker option reading `label`. */
function pick(scope: ParentNode, kind: string, label: string): void {
  const option = [...scope.querySelectorAll(`[data-meta="${kind}"] .cp-option`)].find(
    (n) => n.textContent === label,
  );
  assert.ok(option, `expected a ${kind} option "${label}"`);
  option.dispatchEvent(new jsdom.window.MouseEvent("click", { bubbles: true }));
}

test("size slot: offers every option, marks the current one, commits a pick", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  assert.deepEqual(options(scope, "size"), ["Small", "Medium"]);
  assert.deepEqual(chosen(scope, "size"), ["Medium"]);
  assert.equal(scope.querySelector('[data-meta="size"] .cp-trigger')?.textContent, "Medium");

  // The commit carries DDB's option *value*, not the label.
  pick(scope, "size", "Small");
  assert.deepEqual(calls.size, ["3"]);
});

test("alignment slot: offers every option, marks the current one, commits a pick", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  assert.deepEqual(options(scope, "alignment"), ["Lawful Good", "Unaligned"]);
  assert.deepEqual(chosen(scope, "alignment"), ["Unaligned"]);

  pick(scope, "alignment", "Lawful Good");
  assert.deepEqual(calls.alignment, ["1"]);
});

test("type slot: offers every option, marks the current one, commits a pick", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  assert.deepEqual(options(scope, "type"), ["Aberration", "Undead"]);
  assert.deepEqual(chosen(scope, "type"), ["Undead"]);

  pick(scope, "type", "Aberration");
  assert.deepEqual(calls.type, ["1"]);
});

test("a chosen value rides in a chip, whose ✕ commits the empty option", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, {
    ...adapter,
    alignmentOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
  });

  const chip = scope.querySelector('[data-meta="alignment"]')!.closest(".sb-chip")!;
  assert.equal(
    chip.querySelector(".sb-chip-remove")?.getAttribute("aria-label"),
    "Remove alignment",
  );

  chip.querySelector(".sb-chip-remove")!.dispatchEvent(
    new jsdom.window.MouseEvent("click", { bubbles: true }),
  );
  // Same commit as picking the em-dash: a field with no value leaves the block.
  assert.deepEqual(calls.alignment, [""]);
});

test("a field DDB won't let you empty loses its ✕ rather than the option", () => {
  const scope = scopeFor([]);
  const { adapter, calls } = stubAdapter([]);
  // The stub's size options have no "nothing chosen" entry.
  wireMetaControls(scope, adapter);

  const chip = scope.querySelector('[data-meta="size"]')!.closest(".sb-chip")!;
  assert.equal(chip.querySelector(".sb-chip-remove"), null);
  assert.deepEqual(calls.size, []);
});

test("a slot still prompting has no chip to remove", () => {
  // Nothing has been chosen yet, so there is nothing an ✕ could take away.
  const scope = scopeFor([], { alignment: "" });
  const { adapter } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const slot = scope.querySelector('.meta-slot[data-meta="alignment"]')!;
  assert.equal(slot.closest(".sb-chip"), null);
});

test("a blank size or alignment still renders a placeholder control", () => {
  // The old meta line dropped the text node entirely, leaving no way to set a
  // blank field from the preview; every slot must now hold a control.
  const scope = scopeFor([], { size: "", alignment: "" });

  for (const kind of ["size", "alignment"]) {
    const slot = scope.querySelector(`.meta-slot[data-meta="${kind}"]`);
    assert.ok(slot, `expected a ${kind} slot`);
    assert.ok(slot.classList.contains("is-placeholder"), `${kind} should be dimmed`);
  }

  const { adapter, calls } = stubAdapter([]);
  wireMetaControls(scope, adapter);

  const trigger = scope.querySelector('[data-meta="size"] .cp-trigger')!;
  assert.equal(trigger.textContent, "Size…");
  assert.ok(trigger.classList.contains("is-placeholder"), "and stays dimmed once wired");
  pick(scope, "size", "Small");
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

  pick(scope, "size", "—");
  assert.deepEqual(calls.size, [""]);
});

test("a blank field keeps its prompt wording on DDB's em-dash option", () => {
  // DDB's "nothing chosen" option is labelled "—". Building the list must not
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

  assert.deepEqual(options(scope, "alignment"), ["Alignment…", "Lawful Good"]);
  assert.deepEqual(chosen(scope, "alignment"), ["Alignment…"]);
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

  assert.deepEqual(options(scope, "alignment"), ["—", "Unaligned"]);
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
