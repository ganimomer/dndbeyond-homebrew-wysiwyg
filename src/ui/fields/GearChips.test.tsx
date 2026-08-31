/**
 * Acting on a creature's gear from the Gear row.
 *
 * The promise here is the one the feature exists for: changing what the
 * creature is carrying changes the gear *and* leaves the armor class that gear
 * implies waiting to be accepted — never applied behind the author's back,
 * because the number on the block may have been set on purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fireEvent } from "../../test-support/render.js";
import { renderWithStore } from "../../test-support/editor.js";
import { emptyMonster, type Monster } from "../../statblock/model.js";
import { Field } from "./Field.js";
import { TextRow } from "./TextRow.js";

/** D&D Beyond's own Warrior Veteran: DEX 13 (+1), splint armor, AC 17. */
const GEAR =
  "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
  "[items]splint;Splint Armor[/items]";

function veteran(): Monster {
  const monster = emptyMonster();
  return {
    ...monster,
    gear: GEAR,
    armorClass: { value: 17, type: "splint" },
    abilities: { ...monster.abilities, dex: 13 },
  };
}

/** The same veteran, with a shield already on the row and in the parentheses. */
function shielded(): Monster {
  const monster = veteran();
  return {
    ...monster,
    gear: `${GEAR}, [armor]Shield[/armor]`,
    armorClass: { value: 19, type: "splint and shield" },
  };
}

function setup(t: import("node:test").TestContext, monster = veteran()) {
  const committed: string[] = [];
  const view = renderWithStore(t, monster, () => (
    <TextRow
      field="gear"
      value={monster.gear}
      label="Gear"
      placeholder="gear…"
      onCommit={(_field, value) => committed.push(value)}
      onClear={() => {}}
    />
  ));

  const chip = (text: string) =>
    [...view.root.querySelectorAll<HTMLElement>(".ref")].find((el) => el.textContent === text)!;
  const menuItems = () =>
    [...view.root.querySelectorAll<HTMLElement>(".chip-menu .cm-label")].map(
      (el) => el.textContent,
    );
  const menuItem = (label: string) =>
    [...view.root.querySelectorAll<HTMLElement>(".chip-menu .cm-item")].find(
      (el) => el.querySelector(".cm-label")?.textContent === label,
    );
  const options = () =>
    [...view.root.querySelectorAll<HTMLElement>(".rm-option")].map((el) => el.textContent);
  const option = (name: string) =>
    [...view.root.querySelectorAll<HTMLElement>(".rm-option")].find(
      (el) => el.textContent === name,
    )!;

  return { ...view, committed, chip, menuItems, menuItem, options, option };
}

const click = (el: HTMLElement) =>
  fireEvent.click(el, { bubbles: true, composed: true } as MouseEventInit);

test("clicking a piece of gear opens a menu over it", (t) => {
  const { chip, menuItems } = setup(t);
  click(chip("Splint Armor"));
  assert.deepEqual(menuItems(), ["Replace…", "Remove"]);
});

test("gear that isn't armor can only be removed", (t) => {
  const { chip, menuItems } = setup(t);
  click(chip("Greatsword"));
  // Nothing in the editor knows what replacing a greatsword would mean yet.
  assert.deepEqual(menuItems(), ["Remove"]);
});

test("Replace… offers the mundane armor, and nothing else", (t) => {
  const { chip, menuItem, options } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);

  const listed = options();
  assert.equal(listed.length, 12);
  assert.ok(listed.includes("Chain Mail"));
  assert.ok(listed.includes("Half Plate Armor"));
  // Magic armor and shields are a later phase.
  assert.ok(!listed.some((name) => name?.includes("+1")));
  assert.ok(!listed.includes("Shield"));
});

test("picking armor rewrites just that item of gear", (t) => {
  const { chip, menuItem, option, committed } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Chain Mail"));

  assert.equal(
    committed[0],
    "[items]Greatsword[/items], [items]crossbow, heavy;Heavy Crossbow[/items], " +
      "[armor]Chain Mail[/armor]",
  );
});

test("picking armor offers the class it implies, without applying it", (t) => {
  const { chip, menuItem, option, store } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Chain Mail"));

  // Chain mail is a flat 16 — heavy armor takes no Dexterity at all.
  assert.deepEqual(store.getSession().pendingArmor, { value: 16, type: "chain mail" });
  // And the creature still says 17 until someone accepts.
  assert.equal(store.getMonster()?.armorClass.value, 17);
});

test("half plate's offer counts the Dexterity it is allowed", (t) => {
  const { chip, menuItem, option, store } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Half Plate Armor"));

  // 15 + min(DEX +1, 2) = 16.
  assert.deepEqual(store.getSession().pendingArmor, { value: 16, type: "half plate" });
});

test("a nimbler creature gets more out of half plate, up to the cap", (t) => {
  const monster = veteran();
  const nimble = { ...monster, abilities: { ...monster.abilities, dex: 20 } };
  const { chip, menuItem, option, store } = setup(t, nimble);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Half Plate Armor"));

  // +5 of Dexterity, but half plate only ever lets two of it through.
  assert.deepEqual(store.getSession().pendingArmor, { value: 17, type: "half plate" });
});

test("Remove takes the item and its comma off the row", (t) => {
  const { chip, menuItem, committed } = setup(t);
  click(chip("Heavy Crossbow"));
  click(menuItem("Remove")!);

  assert.equal(
    committed[0],
    "[items]Greatsword[/items], [items]splint;Splint Armor[/items]",
  );
});

test("removing armor offers nothing — there is no armor to imply a class", (t) => {
  const { chip, menuItem, store } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Remove")!);
  assert.equal(store.getSession().pendingArmor, null);
});

test("the menu closes once the armor is picked", (t) => {
  const { chip, menuItem, option, options, menuItems } = setup(t);
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Chain Mail"));

  assert.deepEqual(options(), []);
  assert.deepEqual(menuItems(), []);
});

test("clicking off a chip closes the menu", (t) => {
  const { chip, menuItems, root } = setup(t);
  click(chip("Splint Armor"));
  assert.notDeepEqual(menuItems(), []);

  click(root.querySelector<HTMLElement>(".sb-text-prose")!);
  assert.deepEqual(menuItems(), []);
});

test("a shield in the gear is counted into the armor a swap offers", (t) => {
  const { chip, menuItem, option, store } = setup(t, shielded());
  click(chip("Splint Armor"));
  click(menuItem("Replace…")!);
  click(option("Chain Mail"));

  // Chain mail's flat 16, and the shield the creature is still carrying.
  assert.deepEqual(store.getSession().pendingArmor, {
    value: 18,
    type: "chain mail and shield",
  });
});

test("a shield chip can only be removed — it replaces nothing", (t) => {
  const { chip, menuItems } = setup(t, shielded());
  click(chip("Shield"));
  assert.deepEqual(menuItems(), ["Remove"]);
});

/**
 * The shield's own tests go through `Field` rather than `TextRow`, because the
 * gear commit is where a shield coming or going is noticed and `Field` is what
 * owns that commit — every route into it, the "/" menu and Remove alike, ends
 * there.
 */
function gearRow(t: import("node:test").TestContext, monster: Monster) {
  const written: string[] = [];
  const view = renderWithStore(t, monster, () => <Field field="gear" monster={monster} />, {
    setGear: (text: string) => written.push(text),
  });
  const chip = (text: string) =>
    [...view.root.querySelectorAll<HTMLElement>(".ref")].find((el) => el.textContent === text)!;
  const menuItem = (label: string) =>
    [...view.root.querySelectorAll<HTMLElement>(".chip-menu .cm-item")].find(
      (el) => el.querySelector(".cm-label")?.textContent === label,
    );
  return { ...view, written, chip, menuItem };
}

test("removing a shield offers its two points back", (t) => {
  const { chip, menuItem, store, written } = gearRow(t, shielded());
  click(chip("Shield"));
  click(menuItem("Remove")!);

  assert.equal(written[0], GEAR);
  assert.deepEqual(store.getSession().pendingArmor, { value: 17, type: "splint" });
  // And the creature still says 19 until someone accepts.
  assert.equal(store.getMonster()?.armorClass.value, 19);
});

test("removing a shield the block never counted offers nothing", (t) => {
  const monster = shielded();
  const { chip, menuItem, store } = gearRow(t, {
    ...monster,
    armorClass: { value: 17, type: "splint" },
  });
  click(chip("Shield"));
  click(menuItem("Remove")!);
  assert.equal(store.getSession().pendingArmor, null);
});

test("removing gear that is not a shield leaves the armor class alone", (t) => {
  const { chip, menuItem, store } = gearRow(t, shielded());
  click(chip("Heavy Crossbow"));
  click(menuItem("Remove")!);
  assert.equal(store.getSession().pendingArmor, null);
});

test("the Languages row has no chips to act on", (t) => {
  const monster = { ...veteran(), languages: "Common" };
  const view = renderWithStore(t, monster, () => (
    <TextRow
      field="languages"
      value="[items]Greatsword[/items]"
      label="Languages"
      placeholder="languages…"
      onCommit={() => {}}
      onClear={() => {}}
    />
  ));
  click(view.root.querySelector<HTMLElement>(".ref")!);
  assert.equal(view.root.querySelector(".chip-menu"), null);
});
