/**
 * The end-to-end test: a real D&D Beyond monster form, the real adapter, and
 * the real editor overlay, wired together the way they are in the page.
 *
 * The fixture is a genuine capture of `form#monster-form` (the "Dread Vampire"),
 * with DDB's scripts, its anti-forgery tokens and TinyMCE's rendered toolbar
 * chrome removed, and the option lists the adapter never reads trimmed. Nothing
 * else is touched — the point is that the markup asserted against here is the
 * markup D&D Beyond actually serves, so this fails if their form drifts.
 *
 * Everything else in the suite tests a module against DOM written by the test.
 * This is the one that tests the loop: read the form → render the block → edit
 * in the overlay → write back to the form → persist. It is the contract each
 * step of the Preact rework has to keep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./__fixtures__/monster-form.html";
import { DdbMonsterAdapter } from "./ddb-monster.js";
import { EditorPanel } from "../editor/panel.js";

/** Waits out the panel's requestAnimationFrame render coalescing. */
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

/**
 * Loads the fixture into the document and hands back the adapter, with `save`
 * replaced by a spy — the real one posts to dndbeyond.com.
 */
function loadPage() {
  document.body.innerHTML = fixture;
  document.documentElement.style.overflow = "";

  const adapter = new DdbMonsterAdapter();
  const saves: number[] = [];
  adapter.save = () => {
    saves.push(Date.now());
    return Promise.resolve();
  };
  return { adapter, saves };
}

function openOverlay(t: import("node:test").TestContext, adapter: DdbMonsterAdapter) {
  const panel = new EditorPanel(adapter);
  panel.mount();
  t.after(() => panel.unmount());

  const root = document.getElementById("microbrewery-panel-host")?.shadowRoot;
  assert.ok(root, "overlay mounted into a shadow root");
  return { panel, root: root! };
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;

test("reads D&D Beyond's own form into the model", () => {
  const { adapter } = loadPage();

  assert.equal(adapter.matches(), true);
  const monster = adapter.read();
  assert.ok(monster);

  assert.equal(monster!.ruleset, "5.5e");
  assert.equal(monster!.name, "Dread Vampire");
  // DDB's 2024 sizes are free text, which is why `size` isn't an enum.
  assert.equal(monster!.size, "Medium or Small");
  assert.equal(monster!.type, "Undead");
  assert.equal(monster!.alignment, "Chaotic Evil");
  assert.deepEqual(monster!.armorClass, { value: 16, type: "natural armor" });
  assert.deepEqual(monster!.hitPoints, { average: 195, dieCount: 23, dieValue: 8, modifier: 92 });
  assert.equal(monster!.initiative, "+4 (14)");
  assert.deepEqual(monster!.abilities, { str: 20, dex: 18, con: 18, int: 17, wis: 15, cha: 18 });
  assert.deepEqual(monster!.savingThrows, { dex: 9, con: 9, wis: 7 });
  assert.equal(monster!.challengeRating, "13");
  assert.equal(monster!.passivePerception, 17);
  assert.equal(monster!.languages, "Common plus two other languages");

  // The three listing tables — separate records, not form fields.
  assert.deepEqual(monster!.movements, [
    { type: "Walk", speed: 40 },
    { type: "Climb", speed: 40 },
  ]);
  assert.deepEqual(monster!.skills, { Perception: 7, Stealth: 9 });
  assert.deepEqual(monster!.senses, [{ type: "Darkvision", note: "120 ft." }]);

  // One multi-select split three ways by its "Acid - Resistance" option labels.
  assert.deepEqual(monster!.damageVulnerabilities, ["Radiant"]);
  assert.deepEqual(monster!.damageResistances, ["Necrotic"]);
  assert.deepEqual(monster!.damageImmunities, []);

  // Sections arrive as ready-to-render HTML, and only the ones with content:
  // this creature's Reactions, Mythic Actions and Lair Actions are all empty.
  assert.deepEqual(Object.keys(monster!.descriptionHtml ?? {}).sort(), [
    "actions",
    "bonusActions",
    "characteristics",
    "legendary",
    "traits",
  ]);
  assert.match(monster!.descriptionHtml!.traits!, /Legendary Resistance/);
});

test("renders the creature into the overlay", (t) => {
  const { adapter } = loadPage();
  const { root } = openOverlay(t, adapter);

  const block = root.querySelector(".statblock");
  assert.ok(block, "a stat block is rendered");
  assert.equal(block!.classList.contains("v55e"), true, "in the 5.5e layout");

  assert.equal(root.querySelector(".name-row .name")?.textContent, "Dread Vampire");

  // Queried by element rather than by the block's text: every picker carries its
  // full option list in the DOM, so `textContent` is a haystack of every size,
  // alignment and damage type D&D Beyond offers.
  const slot = (meta: string) =>
    root.querySelector(`[data-meta="${meta}"] .cp-trigger`)?.textContent;
  assert.equal(slot("size"), "Medium or Small");
  assert.equal(slot("type"), "Undead");
  assert.equal(slot("alignment"), "Chaotic Evil");

  const chipDetail = (field: string) =>
    root.querySelector(`.sb-chips[data-field="${field}"] .sb-chip-detail`)?.textContent;
  assert.equal(chipDetail("armorClass"), "16 (natural armor)");
  assert.equal(chipDetail("hitPoints"), "195 (23d8 + 92)");

  const skills = [...root.querySelectorAll('.sb-chips[data-field="skills"] .sb-chip')];
  assert.deepEqual(
    skills.map((chip) => chip.textContent),
    ["Perception +7×", "Stealth +9×"],
  );
});

test("an edit in the overlay writes back to D&D Beyond's form", async (t) => {
  const { adapter } = loadPage();
  const { root } = openOverlay(t, adapter);

  assert.equal(field("field-dexterity").value, "18");

  const input = root.querySelector<HTMLInputElement>('[data-focus-key="score:dex"]');
  assert.ok(input, "the Dexterity score is an input in the block");
  input!.value = "20";
  // Scores commit on `change` — blur, not per keystroke.
  input!.dispatchEvent(new Event("change", { bubbles: true }));

  assert.equal(field("field-dexterity").value, "20", "DDB's own field is updated");

  // The write-back mutates the form, which re-renders the block through observe().
  await nextFrame();
  assert.equal(
    root.querySelector<HTMLInputElement>('[data-focus-key="score:dex"]')?.value,
    "20",
  );
  assert.equal(root.querySelector('[data-mod="dex"]')?.textContent, "+5");
});

test("closing the overlay persists a debounced edit", async (t) => {
  const { adapter, saves } = loadPage();
  const { panel, root } = openOverlay(t, adapter);

  const input = root.querySelector<HTMLInputElement>('[data-focus-key="score:str"]')!;
  input.value = "22";
  input.dispatchEvent(new Event("change", { bubbles: true }));

  // The edit is in the form immediately; autosave is still inside its debounce.
  assert.equal(field("field-strength").value, "22");
  assert.equal(saves.length, 0, "nothing saved yet");

  panel.unmount();
  await nextFrame();

  assert.equal(saves.length, 1, "closing flushes the pending save");
  // t.after would unmount a second time; make it a no-op.
  t.after(() => {});
});
