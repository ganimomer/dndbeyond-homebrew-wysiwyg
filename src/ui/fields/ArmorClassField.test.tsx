import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type ArmorClass, type Monster } from "../../statblock/model.js";
import { fireEvent, renderInShadowRoot } from "../../test-support/render.js";
import type { ArmorSuggestion } from "../../state/session.js";
import { ArmorClassField } from "./ArmorClassField.js";

/** AC 16 (natural armor) on DEX 18 (+4): unarmored 14, so the armor is worth 2. */
const PLATED: ArmorClass = { value: 16, type: "natural armor" };

function monsterWith(armorClass: ArmorClass, dex = 18): Monster {
  const monster = emptyMonster();
  return { ...monster, armorClass, abilities: { ...monster.abilities, dex } };
}

function setup(
  t: import("node:test").TestContext,
  monster: Monster,
  {
    open = true,
    dexChanged = false,
    armorBonus = null as number | null,
    suggestion = null as ArmorSuggestion | null,
  } = {},
) {
  const committed: ArmorClass[] = [];
  const answered: true[] = [];
  const view = renderInShadowRoot(
    t,
    <ArmorClassField
      monster={monster}
      dexChanged={dexChanged}
      armorBonus={armorBonus}
      suggestion={suggestion}
      onSuggestionDone={() => answered.push(true)}
      onCommit={(ac) => committed.push(ac)}
    />,
  );
  // A suggestion opens the form itself; anything else needs the chip clicked.
  if (open && !suggestion) fireEvent.click(view.root.querySelector(".sb-chip-button")!);

  const field = (name: string) => view.root.querySelector<HTMLInputElement>(`[data-ac="${name}"]`)!;
  const prefix = () => view.root.querySelector(".ac-prefix")?.textContent;
  const hint = () => view.root.querySelector<HTMLElement>(".sb-hint");
  const hintFor = (name: string) =>
    view.root.querySelector<HTMLElement>(`.sb-hint[data-hint="${name}"]`);
  const hints = () =>
    [...view.root.querySelectorAll<HTMLElement>(".sb-hint")].map((el) => el.dataset.hint);
  const action = (name: string) =>
    view.root.querySelector<HTMLButtonElement>(`[data-form-action="${name}"]`)!;
  return { ...view, committed, answered, field, prefix, hint, hintFor, hints, action };
}

const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  fireEvent.input(input);
};

const clickAway = () => {
  const elsewhere = document.createElement("div");
  document.body.append(elsewhere);
  elsewhere.click();
  elsewhere.remove();
};

test("closed, the whole value is one button that opens the form", (t) => {
  const { root } = setup(t, monsterWith(PLATED), { open: false });

  const chip = root.querySelector<HTMLButtonElement>(".sb-chip-button")!;
  assert.match(chip.textContent ?? "", /16 \(natural armor\)/);

  fireEvent.click(chip);
  assert.ok(root.querySelector(".ac-form"), "the form is open");
});

test("open, the class is split into what Dexterity gives and what armor adds", (t) => {
  const { root, field, prefix } = setup(t, monsterWith(PLATED));

  assert.equal(root.querySelector(".sb-chip-button"), null, "the chip is gone");
  assert.equal(prefix(), "14 +", "10 + the DEX 18 modifier");
  assert.equal(field("bonus").value, "2");
  assert.equal(field("value").value, "16");
  assert.equal(field("type").value, "natural armor");
});

test("editing the bonus rewrites the total", (t) => {
  const { field } = setup(t, monsterWith(PLATED));

  type(field("bonus"), "5");

  assert.equal(field("value").value, "19");
});

test("editing the total rewrites the bonus", (t) => {
  const { field } = setup(t, monsterWith(PLATED));

  type(field("value"), "20");

  assert.equal(field("bonus").value, "6");
});

test("typing a minus flips the prefix and leaves the field a magnitude", (t) => {
  const { field, prefix } = setup(t, monsterWith(PLATED));

  type(field("bonus"), "-3");

  assert.equal(prefix(), "14 −");
  assert.equal(field("bonus").value, "3", "the sign lives in the prefix");
  assert.equal(field("value").value, "11");
});

test("a total below the unarmored class flips the prefix too", (t) => {
  const { field, prefix } = setup(t, monsterWith(PLATED));

  type(field("value"), "11");

  assert.equal(prefix(), "14 −");
  assert.equal(field("bonus").value, "3");
});

test("stepping the bonus below zero flips the prefix rather than sticking", (t) => {
  const { field, prefix } = setup(t, monsterWith({ value: 14, type: "" }));
  assert.equal(field("bonus").value, "0", "unarmored to begin with");

  // What a number input's down-arrow (or spinner) produces at zero.
  fireEvent.keyDown(field("bonus"), { key: "ArrowDown" });

  assert.equal(prefix(), "14 −");
  assert.equal(field("bonus").value, "1");
  assert.equal(field("value").value, "13");
});

test("the arrows walk the signed scale, so they don't invert below zero", (t) => {
  const { field, prefix } = setup(t, monsterWith({ value: 13, type: "" })); // bonus −1
  assert.equal(prefix(), "14 −");

  fireEvent.keyDown(field("bonus"), { key: "ArrowUp" });

  assert.equal(prefix(), "14 +", "−1 steps up to 0, not down to −2");
  assert.equal(field("bonus").value, "0");
  assert.equal(field("value").value, "14");
});

test("an untouched Dexterity offers nothing, even on a hand-set class", (t) => {
  const { hint } = setup(t, monsterWith(PLATED), { armorBonus: 4 });

  assert.equal(hint(), null);
});

test("a Dexterity change offers the class that keeps the armor worth what it was", (t) => {
  // DEX was 14 (unarmored 12) with AC 16, so the armor is worth 4. DEX is now
  // 18 (unarmored 14), which would silently reinterpret the armor as worth 2.
  const { field, hint } = setup(t, monsterWith(PLATED), { dexChanged: true, armorBonus: 4 });

  assert.equal(hint()?.textContent, "←18");

  fireEvent.click(hint()!);

  assert.equal(field("value").value, "18");
  assert.equal(field("bonus").value, "4", "the armor is worth 4 again");
  assert.equal(hint(), null, "taken, so no longer offered");
});

test("✓ commits the number and the type together", (t) => {
  const { field, action, committed } = setup(t, monsterWith(PLATED));

  type(field("bonus"), "5");
  type(field("type"), "plate armor");
  fireEvent.click(action("commit"));

  assert.deepEqual(committed, [{ value: 19, type: "plate armor" }]);
});

test("Enter in a field commits the whole form", (t) => {
  const { field, committed } = setup(t, monsterWith(PLATED));

  type(field("value"), "17");
  fireEvent.keyDown(field("value"), { key: "Enter" });

  assert.deepEqual(committed, [{ value: 17, type: "natural armor" }]);
});

test("✕, Escape and a click away all abandon the edit", (t) => {
  const abandonments = [
    (v: ReturnType<typeof setup>) => fireEvent.click(v.action("cancel")),
    (v: ReturnType<typeof setup>) => fireEvent.keyDown(v.field("value"), { key: "Escape" }),
    () => clickAway(),
  ];

  for (const abandon of abandonments) {
    const view = setup(t, monsterWith(PLATED));
    type(view.field("value"), "99");
    abandon(view);

    assert.equal(view.root.querySelector(".ac-form"), null, "the form is closed");
    assert.deepEqual(view.committed, []);
  }
});

test("a click inside the form is not a click away from it", (t) => {
  const view = setup(t, monsterWith(PLATED), { dexChanged: true, armorBonus: 4 });

  for (const inside of [view.field("bonus"), view.hint()!, view.action("commit")]) {
    inside.click();
  }

  // The commit button closed it, but nothing was abandoned along the way.
  assert.equal(view.committed.length, 1);
});

test("a closed field has nothing listening for a click away", (t) => {
  const { root, committed } = setup(t, monsterWith(PLATED), { open: false });

  clickAway();

  assert.ok(root.querySelector(".sb-chip-button"), "still a chip");
  assert.deepEqual(committed, []);
});

test("the type field names itself while empty", (t) => {
  const { field } = setup(t, monsterWith({ value: 16, type: "" }));

  assert.equal(field("type").placeholder, "armor type");
});

test("re-opening starts from the creature, not an abandoned draft", (t) => {
  const view = setup(t, monsterWith(PLATED));

  type(view.field("value"), "99");
  fireEvent.click(view.action("cancel"));
  fireEvent.click(view.root.querySelector(".sb-chip-button")!);

  assert.equal(view.field("value").value, "16");
});

test("each field carries the focus key the panel restores to", (t) => {
  const { field } = setup(t, monsterWith(PLATED));

  assert.equal(field("bonus").dataset.focusKey, "ac:bonus");
  assert.equal(field("value").dataset.focusKey, "ac:value");
  assert.equal(field("type").dataset.focusKey, "ac:type");
});

/**
 * A whole armor class offered because the Gear row changed. The rule these are
 * about is the one the component's header sets out: an armor swap is a single
 * fact, so the three fields it touches are taken together or not at all.
 */

/** Chain Mail on the Warrior Veteran: flat 16, and the row reads "chain mail". */
const CHAIN_MAIL: ArmorSuggestion = { value: 16, type: "chain mail" };

test("an offered armor class opens the form itself", (t) => {
  const { root, field } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  // No chip left to click — the form is already up.
  assert.equal(root.querySelector(".sb-chip-button"), null);
  assert.equal(field("value").value, "17");
});

test("it offers the bonus, the total and the type at once", (t) => {
  const { hints, hintFor } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  assert.deepEqual(hints(), ["armor bonus", "armor class", "armor type"]);
  // DEX 13 (+1) → unarmored 11, so chain mail's flat 16 is worth 5.
  assert.equal(hintFor("armor bonus")?.textContent, "←5");
  assert.equal(hintFor("armor class")?.textContent, "←16");
  assert.equal(hintFor("armor type")?.textContent, "←chain mail");
});

test("taking any one of them takes all three", (t) => {
  for (const which of ["armor bonus", "armor class", "armor type"]) {
    const { hintFor, field, prefix } = setup(
      t,
      monsterWith({ value: 17, type: "splint" }, 13),
      { suggestion: CHAIN_MAIL },
    );
    fireEvent.click(hintFor(which)!);

    assert.equal(field("value").value, "16", which);
    assert.equal(field("bonus").value, "5", which);
    assert.equal(field("type").value, "chain mail", which);
    assert.equal(prefix(), "11 +", which);
  }
});

test("taking the offer settles it — no chip is left standing", (t) => {
  const { hintFor, hints } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  fireEvent.click(hintFor("armor class")!);
  assert.deepEqual(hints(), []);
});

test("nothing reaches the creature until the form is applied", (t) => {
  const { hintFor, committed, action } = setup(
    t,
    monsterWith({ value: 17, type: "splint" }, 13),
    { suggestion: CHAIN_MAIL },
  );
  fireEvent.click(hintFor("armor class")!);
  assert.deepEqual(committed, []);

  fireEvent.click(action("commit"));
  assert.deepEqual(committed, [{ value: 16, type: "chain mail" }]);
});

test("half plate takes the Dexterity the offer already accounted for", (t) => {
  // 15 + min(DEX +1, 2) = 16, which on an unarmored 11 is worth 5.
  const { hintFor } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: { value: 16, type: "half plate" },
  });
  assert.equal(hintFor("armor class")?.textContent, "←16");
  assert.equal(hintFor("armor bonus")?.textContent, "←5");
});

test("an offer already agreed with shows no chips", (t) => {
  const { hints } = setup(t, monsterWith({ value: 16, type: "chain mail" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  assert.deepEqual(hints(), []);
});

test("walking away from the offer answers it, so it never fires twice", (t) => {
  const { answered, action } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  assert.deepEqual(answered, []);
  fireEvent.click(action("cancel"));
  assert.deepEqual(answered, [true]);
});

test("applying the offer answers it too", (t) => {
  const { answered, action } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
  });
  fireEvent.click(action("commit"));
  assert.deepEqual(answered, [true]);
});

test("new armor wins over a Dexterity change, which knows nothing of the type", (t) => {
  const { hintFor } = setup(t, monsterWith({ value: 17, type: "splint" }, 13), {
    suggestion: CHAIN_MAIL,
    dexChanged: true,
    armorBonus: 6,
  });
  // Not 11 + 6 = 17, which is what the Dexterity offer alone would have said.
  assert.equal(hintFor("armor class")?.textContent, "←16");
});
