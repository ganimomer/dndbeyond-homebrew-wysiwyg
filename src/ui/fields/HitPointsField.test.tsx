import { test } from "node:test";
import assert from "node:assert/strict";
import type { SelectOption } from "../../adapter/types.js";
import { emptyMonster, type HitPoints, type Monster } from "../../statblock/model.js";
import { fireEvent, renderInShadowRoot } from "../../test-support/render.js";
import { HitPointsField } from "./HitPointsField.js";

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

function setup(
  t: import("node:test").TestContext,
  monster: Monster,
  { open = true, conChanged = false } = {},
) {
  const committed: HitPoints[] = [];
  const view = renderInShadowRoot(
    t,
    <HitPointsField
      monster={monster}
      conChanged={conChanged}
      dieOptions={() => DIE_OPTIONS}
      onCommit={(hp) => committed.push(hp)}
    />,
  );
  // The chip and the form are the same field; opening is a click on the chip.
  if (open) fireEvent.click(view.root.querySelector(".sb-chip-button")!);

  const field = (name: string) => view.root.querySelector<HTMLInputElement>(`[data-hp="${name}"]`)!;
  const hint = (name: string) => view.root.querySelector<HTMLElement>(`[data-hint="${name}"]`);
  const action = (name: string) =>
    view.root.querySelector<HTMLButtonElement>(`[data-form-action="${name}"]`)!;
  return { ...view, committed, field, hint, action };
}

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  fireEvent.input(input);
};

/** A click on the page somewhere the form isn't. */
const clickAway = () => {
  const elsewhere = document.createElement("div");
  document.body.append(elsewhere);
  elsewhere.click();
  elsewhere.remove();
};

test("closed, the whole value is one button that opens the form", (t) => {
  const { root } = setup(t, monsterWith(VAMPIRE), { open: false });

  const chip = root.querySelector<HTMLButtonElement>(".sb-chip-button")!;
  assert.match(chip.textContent ?? "", /195 \(23d8 \+ 92\)/);

  fireEvent.click(chip);
  assert.ok(root.querySelector('[data-hp="average"]'), "the form is open");
});

test("open, the chip is replaced by the four fields", (t) => {
  const { root, field } = setup(t, monsterWith(VAMPIRE));

  assert.equal(root.querySelector(".sb-chip-button"), null, "the chip is gone");
  assert.equal(field("average").value, "195");
  assert.equal(field("dieCount").value, "23");
  assert.equal(field("dieValue").value, "3", "d8's option value");
  assert.equal(field("modifier").value, "92");
});

test("an untouched form offers nothing, even when the average was hand-tuned", (t) => {
  // 23d8 + 92 averages 195; this author wrote 200 on purpose.
  const { hint } = setup(t, monsterWith({ ...VAMPIRE, average: 200 }));

  assert.equal(hint("average"), null);
  assert.equal(hint("modifier"), null);
});

test("raising the die count offers both the new average and the new modifier", (t) => {
  const { field, hint } = setup(t, monsterWith(VAMPIRE));

  type(field("dieCount"), "24");

  // 24 × 4.5 + 92 = 200; the modifier is Constitution once per die, 24 × 4.
  assert.equal(hint("average")?.textContent, "←200");
  assert.equal(hint("modifier")?.textContent, "←96");
});

test("changing the die value offers only the average — the modifier doesn't follow it", (t) => {
  const { field, hint } = setup(t, monsterWith(VAMPIRE));

  const die = field("dieValue");
  die.value = DIE_OPTIONS.find((o) => o.text === "d10")!.value;
  fireEvent.change(die);

  // 23 × 5.5 + 92 = 218.5 → 218.
  assert.equal(hint("average")?.textContent, "←218");
  assert.equal(hint("modifier"), null);
});

test("editing a field back to where it started withdraws its hint", (t) => {
  const { field, hint } = setup(t, monsterWith(VAMPIRE));

  type(field("dieCount"), "24");
  type(field("dieCount"), "23");

  assert.equal(hint("average"), null);
  assert.equal(hint("modifier"), null);
});

test("a Constitution change offers the modifier, and taking it then offers the average", (t) => {
  // CON 18 → 20 (+5), so 23 dice now want 115 rather than 92.
  const { field, hint } = setup(t, monsterWith(VAMPIRE, 20), { conChanged: true });

  assert.equal(hint("modifier")?.textContent, "←115");
  assert.equal(hint("average"), null, "the average still matches the fields on screen");

  fireEvent.click(hint("modifier")!);

  assert.equal(field("modifier").value, "115");
  assert.equal(hint("modifier"), null, "taken, so no longer offered");
  // 23 × 4.5 + 115 = 218.5 → 218.
  assert.equal(hint("average")?.textContent, "←218");
});

test("a hint is a tab stop, so Enter on the focused chip takes it", (t) => {
  const { hint } = setup(t, monsterWith(VAMPIRE, 20), { conChanged: true });

  // A <button> is focusable and activates on Enter without any handler of ours;
  // this asserts the hint is one rather than a decorated <span>.
  assert.equal(hint("modifier")?.tagName, "BUTTON");
});

test("✓ commits all four numbers", (t) => {
  const { field, action, committed } = setup(t, monsterWith(VAMPIRE));

  type(field("average"), "200");
  fireEvent.click(action("commit"));

  assert.deepEqual(committed, [{ average: 200, dieCount: 23, dieValue: 8, modifier: 92 }]);
});

test("Enter in a field commits the whole form", (t) => {
  const { field, committed } = setup(t, monsterWith(VAMPIRE));

  type(field("modifier"), "100");
  fireEvent.keyDown(field("modifier"), { key: "Enter" });

  assert.deepEqual(committed, [{ average: 195, dieCount: 23, dieValue: 8, modifier: 100 }]);
});

test("✕ and Escape abandon the edit", (t) => {
  const abandonments = [
    (v: ReturnType<typeof setup>) => fireEvent.click(v.action("cancel")),
    (v: ReturnType<typeof setup>) => fireEvent.keyDown(v.field("average"), { key: "Escape" }),
  ];

  for (const abandon of abandonments) {
    const view = setup(t, monsterWith(VAMPIRE));
    type(view.field("average"), "999");
    abandon(view);

    assert.equal(view.root.querySelector(".hp-form"), null, "the form is closed");
    assert.deepEqual(view.committed, []);
  }
});

test("a click away commits the edit rather than dropping it", (t) => {
  const view = setup(t, monsterWith(VAMPIRE));

  type(view.field("average"), "999");
  clickAway();

  assert.equal(view.root.querySelector(".hp-form"), null, "the form is closed");
  assert.deepEqual(view.committed, [{ ...VAMPIRE, average: 999 }]);
});

test("a click away from an untouched form commits nothing", (t) => {
  const view = setup(t, monsterWith(VAMPIRE));

  clickAway();

  assert.deepEqual(view.committed, [], "opening a form to read it is not an edit");
});

test("a click inside the form is not a click away from it", (t) => {
  const view = setup(t, monsterWith(VAMPIRE, 20), { conChanged: true });

  for (const inside of [view.field("average"), view.hint("modifier")!, view.action("commit")]) {
    inside.click();
  }

  // The commit button closed it, but nothing was abandoned along the way.
  assert.equal(view.committed.length, 1);
});

test("a closed field has nothing listening for a click away", (t) => {
  const { root, committed } = setup(t, monsterWith(VAMPIRE), { open: false });

  clickAway();

  assert.ok(root.querySelector(".sb-chip-button"), "still a chip");
  assert.deepEqual(committed, []);
});

test("a blank or unusable field falls back to the value it held", (t) => {
  const { field, action, committed } = setup(t, monsterWith(VAMPIRE));

  type(field("dieCount"), "");
  fireEvent.click(action("commit"));

  assert.deepEqual(committed, [VAMPIRE]);
});

test("re-opening starts from the creature, not an abandoned draft", (t) => {
  const view = setup(t, monsterWith(VAMPIRE));

  type(view.field("average"), "999");
  fireEvent.click(view.action("cancel"));
  fireEvent.click(view.root.querySelector(".sb-chip-button")!);

  assert.equal(view.field("average").value, "195");
});

test("each field carries the focus key the panel restores to", (t) => {
  const { field } = setup(t, monsterWith(VAMPIRE));

  assert.equal(field("average").dataset.focusKey, "hp:average");
  assert.equal(field("dieValue").dataset.focusKey, "hp:dieValue");
});
