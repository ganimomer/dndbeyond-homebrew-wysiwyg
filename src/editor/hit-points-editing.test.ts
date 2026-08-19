import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { SelectOption } from "../adapter/types.js";
import type { HitPoints, Monster } from "../statblock/model.js";

// hit-points-line builds DOM via the global `document`; back it with jsdom.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as Record<string, unknown>).document = jsdom.window.document;
(globalThis as Record<string, unknown>).window = jsdom.window;

const { hitPointsChip } = await import("../preview/hit-points-line.js");
const { wireHitPoints } = await import("./hit-points-editing.js");
const { emptyMonster } = await import("../statblock/model.js");

/** DDB's Hit Die select: numeric codes labelled "d4".."d20". */
const DIE_OPTIONS: SelectOption[] = [4, 6, 8, 10, 12, 20].map((faces, i) => ({
  value: String(i + 1),
  text: `d${faces}`,
  selected: faces === 8,
}));

/** 23d8 + 92 = 195, with a Constitution of 18 (+4) that agrees with it. */
const VAMPIRE: HitPoints = { average: 195, dieCount: 23, dieValue: 8, modifier: 92 };

function monsterWith(hitPoints: HitPoints, con = 18): Monster {
  const monster = emptyMonster();
  return { ...monster, hitPoints, abilities: { ...monster.abilities, con } };
}

interface WireOptions {
  open?: boolean;
  /** Values the user has already typed into the open form. */
  draft?: Partial<HitPoints>;
  conChanged?: boolean;
}

function setup(monster: Monster, { open = true, draft, conChanged = false }: WireOptions = {}) {
  const scope = jsdom.window.document.createElement("div");
  scope.append(hitPointsChip(monster));

  const calls = {
    opened: 0,
    changed: [] as HitPoints[],
    committed: [] as HitPoints[],
    cancelled: 0,
  };
  wireHitPoints(scope, monster, {
    state: open
      ? { draft: { ...monster.hitPoints, ...draft }, baseline: monster.hitPoints }
      : null,
    conChanged,
    dieOptions: () => DIE_OPTIONS,
    onOpen: () => calls.opened++,
    onChange: (d) => calls.changed.push(d),
    onCommit: (hp) => calls.committed.push(hp),
    onCancel: () => calls.cancelled++,
  });
  return { scope, calls };
}

const field = (scope: ParentNode, name: string) =>
  scope.querySelector<HTMLInputElement>(`[data-hp="${name}"]`)!;
const hint = (scope: ParentNode, name: string) =>
  scope.querySelector<HTMLElement>(`[data-hp-hint="${name}"]`);
const action = (scope: ParentNode, name: string) =>
  scope.querySelector<HTMLButtonElement>(`[data-hp-action="${name}"]`)!;
const click = (node: Element) => node.dispatchEvent(new jsdom.window.Event("click"));
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new jsdom.window.Event("input", { bubbles: true }));
};

test("closed, the whole value is one button that opens the form", () => {
  const { scope, calls } = setup(monsterWith(VAMPIRE), { open: false });

  const chip = scope.querySelector<HTMLButtonElement>(".sb-chip-button")!;
  assert.match(chip.textContent ?? "", /195 \(23d8 \+ 92\)/);

  click(chip);
  assert.equal(calls.opened, 1);
});

test("open, the chip is replaced by the four fields", () => {
  const { scope } = setup(monsterWith(VAMPIRE));

  assert.equal(scope.querySelector(".sb-chip-button"), null, "the chip is gone");
  assert.equal(field(scope, "average").value, "195");
  assert.equal(field(scope, "dieCount").value, "23");
  assert.equal(field(scope, "dieValue").value, "3", "d8's option value");
  assert.equal(field(scope, "modifier").value, "92");
});

test("an untouched form offers nothing, even when the average was hand-tuned", () => {
  // 23d8 + 92 averages 195; this author wrote 200 on purpose.
  const { scope } = setup(monsterWith({ ...VAMPIRE, average: 200 }));

  assert.equal(hint(scope, "average"), null);
  assert.equal(hint(scope, "modifier"), null);
});

test("raising the die count offers both the new average and the new modifier", () => {
  const { scope } = setup(monsterWith(VAMPIRE));

  type(field(scope, "dieCount"), "24");

  // 24 × 4.5 + 92 = 200; the modifier is Constitution once per die, 24 × 4.
  assert.equal(hint(scope, "average")?.textContent, "←200");
  assert.equal(hint(scope, "modifier")?.textContent, "←96");
});

test("changing the die value offers only the average — the modifier doesn't follow it", () => {
  const { scope } = setup(monsterWith(VAMPIRE));

  const die = field(scope, "dieValue");
  die.value = DIE_OPTIONS.find((o) => o.text === "d10")!.value;
  die.dispatchEvent(new jsdom.window.Event("change", { bubbles: true }));

  // 23 × 5.5 + 92 = 218.5 → 218.
  assert.equal(hint(scope, "average")?.textContent, "←218");
  assert.equal(hint(scope, "modifier"), null);
});

test("editing a field back to where it started withdraws its hint", () => {
  const { scope } = setup(monsterWith(VAMPIRE));

  type(field(scope, "dieCount"), "24");
  type(field(scope, "dieCount"), "23");

  assert.equal(hint(scope, "average"), null);
  assert.equal(hint(scope, "modifier"), null);
});

test("a Constitution change offers the modifier, and taking it then offers the average", () => {
  // CON 18 → 20 (+5), so 23 dice now want 115 rather than 92.
  const { scope } = setup(monsterWith(VAMPIRE, 20), { conChanged: true });

  const modifierHint = hint(scope, "modifier");
  assert.equal(modifierHint?.textContent, "←115");
  assert.equal(hint(scope, "average"), null, "the average still matches the fields on screen");

  click(modifierHint!);

  assert.equal(field(scope, "modifier").value, "115");
  assert.equal(hint(scope, "modifier"), null, "taken, so no longer offered");
  // 23 × 4.5 + 115 = 218.5 → 218.
  assert.equal(hint(scope, "average")?.textContent, "←218");
});

test("a hint is a tab stop, so Enter on the focused chip takes it", () => {
  const { scope } = setup(monsterWith(VAMPIRE, 20), { conChanged: true });

  // A <button> is focusable and activates on Enter without any handler of ours;
  // this asserts the hint is one rather than a decorated <span>.
  assert.equal(hint(scope, "modifier")?.tagName, "BUTTON");
});

test("✓ commits all four numbers", () => {
  const { scope, calls } = setup(monsterWith(VAMPIRE));

  type(field(scope, "average"), "200");
  click(action(scope, "commit"));

  assert.deepEqual(calls.committed, [{ average: 200, dieCount: 23, dieValue: 8, modifier: 92 }]);
});

test("Enter in a field commits the whole form", () => {
  const { scope, calls } = setup(monsterWith(VAMPIRE));

  type(field(scope, "modifier"), "100");
  field(scope, "modifier").dispatchEvent(
    new jsdom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );

  assert.deepEqual(calls.committed, [{ average: 195, dieCount: 23, dieValue: 8, modifier: 100 }]);
});

test("✕ and Escape abandon the edit", () => {
  for (const abandon of [
    (scope: ParentNode) => click(action(scope, "cancel")),
    (scope: ParentNode) =>
      field(scope, "average").dispatchEvent(
        new jsdom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
  ]) {
    const { scope, calls } = setup(monsterWith(VAMPIRE));
    type(field(scope, "average"), "999");
    abandon(scope);

    assert.equal(calls.cancelled, 1);
    assert.deepEqual(calls.committed, []);
  }
});

test("every edit is reported so the panel can hold the draft across re-renders", () => {
  const { scope, calls } = setup(monsterWith(VAMPIRE));

  type(field(scope, "average"), "200");

  assert.deepEqual(calls.changed.at(-1), { ...VAMPIRE, average: 200 });
});

test("a blank or unusable field falls back to the value it held", () => {
  const { scope, calls } = setup(monsterWith(VAMPIRE));

  type(field(scope, "dieCount"), "");
  click(action(scope, "commit"));

  assert.deepEqual(calls.committed, [VAMPIRE]);
});

test("each field carries the focus key the panel restores to", () => {
  const { scope } = setup(monsterWith(VAMPIRE));

  assert.equal(field(scope, "average").dataset.focusKey, "hp:average");
  assert.equal(field(scope, "dieValue").dataset.focusKey, "hp:dieValue");
});
