import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { visibleMeta } from "./registry.js";
import { fireEvent, renderInShadowRoot, userEvent } from "../../test-support/render.js";
import { MetaLine, type MetaControlsAdapter } from "./MetaLine.js";

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
  const adapter: MetaControlsAdapter = {
    sizeOptions: () => [
      { value: "3", text: "Small", selected: false },
      { value: "4", text: "Medium", selected: true },
    ],
    typeOptions: () => [
      { value: "1", text: "Aberration", selected: false },
      { value: "16", text: "Undead", selected: true },
    ],
    subTypeOptions: () => SUBTYPES(subSelected),
    alignmentOptions: () => [
      { value: "1", text: "Lawful Good", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
    setSize: (v) => calls.size.push(v),
    setType: (v) => calls.type.push(v),
    setSubTypes: (v) => calls.sub.push(v),
    setAlignment: (v) => calls.alignment.push(v),
  };
  return { adapter, calls };
}

/**
 * The meta line with every slot showing. Blank slots are only on the block when
 * the user has added them, so the tests reveal them explicitly.
 */
function setup(
  t: import("node:test").TestContext,
  subTypes: string[] = [],
  overrides: Partial<Monster> = {},
  adapterOverrides: Partial<MetaControlsAdapter> = {},
  subSelected: string[] = [],
) {
  const monster: Monster = { ...emptyMonster(), type: "Undead", subTypes, ...overrides };
  const { adapter, calls } = stubAdapter(subSelected);
  const revealed = new Set(["size", "type", "subTypes", "alignment"] as const);
  const view = renderInShadowRoot(
    t,
    <MetaLine
      monster={monster}
      shown={visibleMeta(monster, revealed)}
      adapter={{ ...adapter, ...adapterOverrides }}
    />,
  );

  const options = (kind: string) =>
    [...view.root.querySelectorAll(`[data-meta="${kind}"] .cp-option`)].map(
      (n) => n.textContent ?? "",
    );
  const chosen = (kind: string) =>
    [...view.root.querySelectorAll(`[data-meta="${kind}"] .cp-option`)]
      .filter((n) => n.getAttribute("aria-selected") === "true")
      .map((n) => n.textContent ?? "");
  const pick = (kind: string, label: string) => {
    const option = [...view.root.querySelectorAll(`[data-meta="${kind}"] .cp-option`)].find(
      (n) => n.textContent === label,
    );
    assert.ok(option, `expected a ${kind} option "${label}"`);
    fireEvent.click(option);
  };
  return { ...view, calls, options, chosen, pick };
}

test("size slot: offers every option, marks the current one, commits a pick", (t) => {
  const { root, calls, options, chosen, pick } = setup(t);

  assert.deepEqual(options("size"), ["Small", "Medium"]);
  assert.deepEqual(chosen("size"), ["Medium"]);
  assert.equal(root.querySelector('[data-meta="size"] .cp-trigger')?.textContent, "Medium");

  // The commit carries DDB's option *value*, not the label.
  pick("size", "Small");
  assert.deepEqual(calls.size, ["3"]);
});

test("alignment slot: offers every option, marks the current one, commits a pick", (t) => {
  const { calls, options, chosen, pick } = setup(t);

  assert.deepEqual(options("alignment"), ["Lawful Good", "Unaligned"]);
  assert.deepEqual(chosen("alignment"), ["Unaligned"]);

  pick("alignment", "Lawful Good");
  assert.deepEqual(calls.alignment, ["1"]);
});

test("type slot: offers every option, marks the current one, commits a pick", (t) => {
  const { calls, options, chosen, pick } = setup(t);

  assert.deepEqual(options("type"), ["Aberration", "Undead"]);
  assert.deepEqual(chosen("type"), ["Undead"]);

  pick("type", "Aberration");
  assert.deepEqual(calls.type, ["1"]);
});

test("a chosen value rides in a chip, whose ✕ commits the empty option", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, [], {}, {
    alignmentOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
  });

  const chip = root.querySelector('[data-meta="alignment"]')!.closest(".sb-chip")!;
  assert.equal(
    chip.querySelector(".sb-chip-remove")?.getAttribute("aria-label"),
    "Remove alignment",
  );

  await user.click(chip.querySelector<HTMLElement>(".sb-chip-remove")!);

  // Same commit as picking the em-dash: a field with no value leaves the block.
  assert.deepEqual(calls.alignment, [""]);
});

test("a field DDB won't let you empty loses its ✕ rather than the option", (t) => {
  // The stub's size options have no "nothing chosen" entry.
  const { root, calls } = setup(t);

  const chip = root.querySelector('[data-meta="size"]')!.closest(".sb-chip")!;
  assert.equal(chip.querySelector(".sb-chip-remove"), null);
  assert.deepEqual(calls.size, []);
});

test("a slot still prompting has no chip to remove", (t) => {
  // Nothing has been chosen yet, so there is nothing an ✕ could take away.
  const { root } = setup(t, [], { alignment: "" });

  const slot = root.querySelector('.meta-slot[data-meta="alignment"]')!;
  assert.equal(slot.closest(".sb-chip"), null);
});

test("a blank slot still holds a control, dimmed and ready", (t) => {
  const { root, calls, pick } = setup(t, [], { size: "", alignment: "" });

  for (const kind of ["size", "alignment"]) {
    assert.ok(root.querySelector(`.meta-slot[data-meta="${kind}"]`), `expected a ${kind} slot`);
  }
  const trigger = root.querySelector('[data-meta="size"] .cp-trigger')!;
  assert.equal(trigger.textContent, "Size…");
  assert.ok(trigger.classList.contains("is-placeholder"), "and it reads as a prompt");

  pick("size", "Small");
  assert.deepEqual(calls.size, ["3"]);
});

test("the dimming rides the trigger, not the slot around the popover", (t) => {
  // The slot's `opacity` would take its whole subtree down with it, and the
  // popover hangs inside the slot — so a menu opened from a prompting field
  // rendered at 60%.
  const { root } = setup(t, [], { size: "" });

  const slot = root.querySelector('.meta-slot[data-meta="size"]')!;
  assert.equal(slot.classList.contains("is-placeholder"), false);
  assert.ok(slot.querySelector(".cp-trigger.is-placeholder"), "the trigger carries it instead");
  assert.equal(slot.querySelector(".cp-panel")?.closest(".is-placeholder"), null);
});

test("picking the em-dash option clears the slot, taking it off the block", (t) => {
  // How a single-select field is dismissed: DDB's own "nothing chosen" option
  // commits "", and a slot with no value isn't rendered next time round.
  const { calls, pick } = setup(t, [], {}, {
    sizeOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "4", text: "Medium", selected: true },
    ],
  });

  pick("size", "—");
  assert.deepEqual(calls.size, [""]);
});

test("a blank field keeps its prompt wording on DDB's em-dash option", (t) => {
  // DDB's "nothing chosen" option is labelled "—". Building the list must not
  // let that dash replace the "Alignment…" prompt.
  const { options, chosen } = setup(t, [], { alignment: "" }, {
    alignmentOptions: () => [
      { value: "", text: "—", selected: true },
      { value: "1", text: "Lawful Good", selected: false },
    ],
  });

  assert.deepEqual(options("alignment"), ["Alignment…", "Lawful Good"]);
  assert.deepEqual(chosen("alignment"), ["Alignment…"]);
});

test("a populated field leaves every option label alone", (t) => {
  const { options } = setup(t, [], {}, {
    alignmentOptions: () => [
      { value: "", text: "—", selected: false },
      { value: "10", text: "Unaligned", selected: true },
    ],
  });

  assert.deepEqual(options("alignment"), ["—", "Unaligned"]);
});

test("subtype datalist is filled with every tag label", (t) => {
  const { root } = setup(t, ["shifter"], {}, {}, ["62"]);

  assert.deepEqual(
    [...root.querySelectorAll("datalist option")].map((o) => (o as HTMLOptionElement).value),
    ["shifter", "aarakocra", "elf"],
  );
});

test("removing a chip commits the set without that tag's value", async (t) => {
  const user = userEvent.setup();
  const { root, calls } = setup(t, ["shifter"], {}, {}, ["62"]);

  const subtypes = root.querySelector('.meta-subtypes[data-meta="subTypes"]')!;
  await user.click(subtypes.querySelector<HTMLElement>(".sb-chip-remove")!);

  assert.deepEqual(calls.sub, [[]]);
});

test("adding a known tag commits the augmented set", (t) => {
  const { root, calls } = setup(t, ["shifter"], {}, {}, ["62"]);

  const input = root.querySelector<HTMLInputElement>(".meta-add")!;
  input.value = "elf";
  fireEvent.change(input);

  assert.deepEqual(calls.sub, [["62", "12"]]);
});

test("adding an unknown tag clears the input and commits nothing", (t) => {
  const { root, calls } = setup(t);

  const input = root.querySelector<HTMLInputElement>(".meta-add")!;
  input.value = "nonsense";
  fireEvent.change(input);

  assert.equal(input.value, "");
  assert.deepEqual(calls.sub, []);
});

test("composes the line from the slots that have values", (t) => {
  const shown = (overrides: Partial<Monster>) => {
    const monster: Monster = { ...emptyMonster(), type: "humanoid", ...overrides };
    const { adapter } = stubAdapter([]);
    // No `revealed`: only the slots the creature actually has a value for.
    const view = renderInShadowRoot(
      t,
      <MetaLine monster={monster} shown={visibleMeta(monster)} adapter={adapter} />,
    );
    // Only what is on screen: every picker carries its whole option list in the
    // DOM, so raw textContent is a haystack of every size and alignment DDB
    // offers. The closed panels (and the subtype datalist) are not the sentence.
    const sentence = document.createElement("div");
    sentence.append(...[...view.root.childNodes].map((node) => node.cloneNode(true)));
    for (const hidden of sentence.querySelectorAll(".cp-panel, datalist")) hidden.remove();
    const text = sentence.textContent ?? "";
    view.rerender(null);
    return text;
  };

  // What is being read here is the sentence the separators make of the slots.
  // The single-select values carry no ✕ because this stub's options include no
  // "nothing chosen" entry to commit — that pairing has its own tests above.
  assert.equal(shown({ alignment: "" }), "Medium humanoid");
  assert.equal(shown({ size: "", type: "" }), "unaligned");
  // The subtype's parenthetical hugs the type it qualifies, and its tags do
  // carry a ✕ (the trailing "add…" box is the tag editor's, not the sentence's).
  assert.equal(
    shown({ subTypes: ["elf"] }).replace(/\s+/g, " "),
    "Medium humanoid (elf× ), unaligned",
  );
  // Nothing at all rather than an empty italic line of stray separators.
  assert.equal(shown({ size: "", type: "", alignment: "" }), "");
});
