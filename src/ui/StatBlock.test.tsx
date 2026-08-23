/**
 * The block as a whole: which rows are printed, in what order, and what the two
 * layouts disagree about. Each field's own behaviour is its component's test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMonster, type Monster, type Ruleset } from "../statblock/model.js";
import { basicsFields, hiddenFields, tidbitFields } from "./fields/registry.js";
import { fireEvent } from "../test-support/render.js";
import { renderBlock } from "../test-support/editor.js";
import { kindByMacro } from "../adapter/reference-catalog.js";
import { LookupController } from "./lookup/lookup-context.js";
import {
  ADDABLE_SECTIONS,
  SECTION_LABEL,
  SECTION_PLACEHOLDER,
} from "./prose/section-registry.js";

const creature = (ruleset: Ruleset, overrides: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  ruleset,
  ...overrides,
});

/** The optional rows currently on the block, in print order. */
const rows = (root: ShadowRoot): string[] =>
  [...root.querySelectorAll<HTMLElement>(".basics .line[data-row]")].map((l) => l.dataset.row!);

/** A creature with a value for every optional field. */
const FURNISHED: Partial<Monster> = {
  subTypes: ["elf"],
  savingThrows: { dex: 5 },
  skills: { Stealth: 6 },
  damageVulnerabilities: ["Fire"],
  damageResistances: ["Cold"],
  damageImmunities: ["Poison"],
  conditionImmunities: ["Charmed"],
  gear: "Longsword",
  senses: [{ type: "Darkvision", note: "60 ft." }],
  languages: "Common",
};

for (const ruleset of ["5e", "5.5e"] as const) {
  test(`${ruleset} prints no optional row a blank creature has no value for`, (t) => {
    const { root } = renderBlock(t, creature(ruleset));

    assert.deepEqual(rows(root), []);
    // The rows that aren't optional are still there.
    assert.ok(root.querySelector('.sb-chips[data-field="movements"]'), "Speed");
    assert.ok(root.querySelector('.sb-chips[data-field="hitPoints"]'), "HP");
  });

  test(`${ruleset} prints a row once the creature has a value for it`, (t) => {
    const { root } = renderBlock(t, creature(ruleset, { languages: "Common" }));

    assert.deepEqual(rows(root), ["languages"]);
    assert.equal(root.querySelector(".sb-text-prose")?.textContent, "Common");
  });

  test(`${ruleset} prints a revealed row empty, ready to fill in`, (t) => {
    const { root } = renderBlock(t, creature(ruleset), { revealed: ["languages"] });

    assert.deepEqual(rows(root), ["languages"]);
    assert.equal(root.querySelector(".sb-text-prose")?.textContent, "");
  });

  test(`${ruleset} keeps every optional row in the layout's print order`, (t) => {
    const { root } = renderBlock(t, creature(ruleset, FURNISHED));

    assert.deepEqual(
      rows(root),
      tidbitFields(ruleset).map((spec) => spec.key),
    );
  });

  test(`${ruleset} offers the missing fields, and drops the footer once none are`, (t) => {
    const blank = renderBlock(t, creature(ruleset));
    assert.ok(blank.root.querySelector(".add-field"), "the Add… footer is present");

    const hidden = hiddenFields(creature(ruleset), undefined, ruleset);
    assert.ok(hidden.some((s) => s.key === "skills"));
    assert.ok(!hidden.some((s) => s.key === "size"), "size has a value");

    const full = renderBlock(t, creature(ruleset, FURNISHED));
    assert.deepEqual(hiddenFields(creature(ruleset, FURNISHED), undefined, ruleset), []);
    assert.equal(full.root.querySelector(".add-field"), null, "nothing left to add");
  });

  test(`${ruleset} prints the meta line only when a slot has something to say`, (t) => {
    const shown = renderBlock(t, creature(ruleset, { alignment: "" }));
    assert.ok(shown.root.querySelector(".meta"), "size and type still show");

    // Nothing at all rather than an empty italic line of stray separators.
    const bare = renderBlock(t, creature(ruleset, { size: "", type: "", alignment: "" }));
    assert.equal(bare.root.querySelector(".meta"), null);
  });

  test(`${ruleset} flags the armor class and hit points as derived`, (t) => {
    // The highlight that warns a score edit may have invalidated them — the
    // only signal while the chips are closed. In 5.5e the AC flag sits on the
    // value span rather than the line, which also carries Initiative.
    const { root } = renderBlock(t, creature(ruleset));

    assert.ok(
      root.querySelector('.sb-chips[data-field="armorClass"]')?.closest('[data-dep~="dex"]'),
      "armor class is inside a dex-dependent element",
    );
    assert.equal(
      root.querySelector('.sb-chips[data-field="hitPoints"]')?.closest(".line")?.dataset.dep,
      "con",
    );
  });

  test(`${ruleset} lands the caret somewhere real for every field it offers`, (t) => {
    // Adding a row is always a prelude to filling it in, so each spec names the
    // control the caret should go to. If the two ever disagreed the caret would
    // silently land nowhere.
    const monster = creature(ruleset);
    const { root } = renderBlock(t, monster, {
      revealed: basicsFields(ruleset).map((spec) => spec.key),
    });

    for (const spec of basicsFields(ruleset)) {
      assert.ok(
        root.querySelector(`[data-focus-key="${spec.focusKey}"]`),
        `${spec.key} names ${spec.focusKey}, which is on nothing`,
      );
    }
  });
}

test("5.5e prints damage and condition immunities as one row", (t) => {
  const { root } = renderBlock(
    t,
    creature("5.5e", { damageImmunities: ["Poison"], conditionImmunities: ["Charmed"] }),
  );

  assert.deepEqual(rows(root), ["immunities"]);
});

test("5e prints damage and condition immunities as two rows", (t) => {
  const { root } = renderBlock(
    t,
    creature("5e", { damageImmunities: ["Poison"], conditionImmunities: ["Charmed"] }),
  );

  assert.deepEqual(rows(root), ["damageImmunities", "conditionImmunities"]);
});

test("the Add… menu names every field the creature hasn't got, meta slots first", (t) => {
  const { root } = renderBlock(t, creature("5.5e"));

  assert.deepEqual(
    [...root.querySelectorAll(".add-field .cm-item .cm-label")].map((n) => n.textContent),
    [
      "Subtype",
      "Skills",
      "Vulnerabilities",
      "Resistances",
      "Immunities",
      "Gear",
      "Senses",
      "Languages",
    ],
  );
});

test("picking from the Add… menu reveals that field and names the control to land in", (t) => {
  const { root, store } = renderBlock(t, creature("5.5e"));

  const item = [...root.querySelectorAll<HTMLElement>(".add-field .cm-item")].find(
    (li) => li.textContent === "Senses",
  )!;
  fireEvent.click(item);

  assert.deepEqual([...store.getSession().revealed], ["senses"]);
  assert.equal(store.getSession().pendingFocus, "add:senses");
});

test("a revealed field leaves the menu and appears on the block", (t) => {
  const { root } = renderBlock(t, creature("5.5e"), { revealed: ["senses"] });

  const offered = [...root.querySelectorAll(".add-field .cm-item .cm-label")].map(
    (n) => n.textContent,
  );
  assert.ok(!offered.includes("Senses"), "already on the block");
  assert.ok(root.querySelector('.sb-chips[data-field="senses"]'), "and rendered");
});

test("a section D&D Beyond has text for is editable in place", (t) => {
  const { root } = renderBlock(
    t,
    creature("5.5e", {
      descriptionHtml: {
        traits: "<p>Legendary Resistance (3/Day).</p>",
        actions: "<p>Multiattack.</p>",
      },
    }),
  );

  // Every populated section, not just Traits — which is all the old loop could
  // manage, because each one cost it another editor to hold and guard. The
  // editable box is now one *per entry*, so the section is the container.
  for (const section of ["traits", "actions"]) {
    const body = root.querySelector(`[data-section="${section}"]`);
    assert.ok(body, `${section} is on the block`);
    const entries = body!.querySelectorAll('[contenteditable="true"]');
    assert.equal(entries.length, 1, `${section} has an editor for its one entry`);
  }
});

test("a list section is cut into one editor per entry", (t) => {
  // The point of the whole arrangement: an author grabs a trait, not the wall
  // of text all six of them used to be.
  const { root } = renderBlock(
    t,
    creature("5.5e", {
      descriptionHtml: {
        traits: [
          "<p><em><strong>Misty Escape.</strong></em> It becomes mist.</p>",
          // No bold lead-in, so this belongs to Misty Escape rather than
          // starting an entry of its own.
          "<p>While it has 0 Hit Points it can't return.</p>",
          "<p><em><strong>Spider Climb.</strong></em> It climbs.</p>",
        ].join(""),
      },
    }),
  );

  const entries = root.querySelectorAll('[data-section="traits"] .sb-item');
  assert.equal(entries.length, 2);
  assert.match(entries[0]!.textContent ?? "", /Misty Escape.*can't return/s);
  assert.match(entries[1]!.textContent ?? "", /Spider Climb/);
});

test("the Description is not cut up — it is prose, not a list", (t) => {
  const { root } = renderBlock(
    t,
    creature("5.5e", {
      descriptionHtml: { characteristics: "<p>A pale figure.</p><p>It hunts by night.</p>" },
    }),
  );

  const entries = root.querySelectorAll('[data-section="characteristics"] .sb-item');
  assert.equal(entries.length, 1, "one editor over the whole thing");
});

test("a section that only exists as sample entries stays read-only", (t) => {
  // Nothing behind it in D&D Beyond's form to write back to.
  const { root } = renderBlock(
    t,
    creature("5.5e", { traits: [{ name: "Spider Climb", text: "The vampire can climb." }] }),
  );

  const body = root.querySelector('[data-section="traits"]');
  assert.ok(body);
  assert.equal(body!.getAttribute("contenteditable"), null);
  assert.match(body!.textContent ?? "", /Spider Climb/);
});

for (const ruleset of ["5e", "5.5e"] as const) {
  test(`${ruleset} prints nothing for a section with neither text nor a reveal`, (t) => {
    const { root } = renderBlock(t, creature(ruleset));

    for (const section of ADDABLE_SECTIONS) {
      assert.equal(
        root.querySelector(`[data-section="${section}"]`),
        null,
        `${section} has nothing to say`,
      );
    }
  });

  test(`${ruleset} prints a revealed section as an empty editor to type into`, (t) => {
    const { root } = renderBlock(t, creature(ruleset), {
      revealedSections: ["bonusActions"],
    });

    const section = root.querySelector<HTMLElement>('[data-section="bonusActions"]');
    assert.ok(section, "on the block");
    const body = section!.querySelector<HTMLElement>('[contenteditable="true"]');
    assert.ok(body, "holding one empty entry to type into");
    assert.equal(body!.textContent, "", "and empty");
    // An empty contenteditable collapses to nothing; the prompt is what holds
    // the line open and says what belongs there.
    assert.ok(body!.classList.contains("is-empty"));
    assert.equal(body!.dataset.placeholder, SECTION_PLACEHOLDER.bonusActions);
  });

  test(`${ruleset} heads a revealed section with the name the menu offered it under`, (t) => {
    const { root } = renderBlock(t, creature(ruleset), { revealedSections: ["reactions"] });

    const headings = [...root.querySelectorAll(".statblock .heading, .statblock h4")].map((h) =>
      (h.textContent ?? "").trim(),
    );
    assert.ok(headings.includes(SECTION_LABEL.reactions));
  });

  test(`${ruleset} gives every section on the block a way off it again`, (t) => {
    const { root } = renderBlock(
      t,
      creature(ruleset, {
        descriptionHtml: Object.fromEntries(
          ADDABLE_SECTIONS.map((key) => [key, `<p>${key}</p>`]),
        ),
      }),
    );

    for (const section of ADDABLE_SECTIONS) {
      assert.ok(
        root.querySelector(`[aria-label="Remove ${SECTION_LABEL[section]}"]`),
        `${section} can be removed`,
      );
    }
  });
}

test("the Description below the block is editable, like every other section", (t) => {
  // It was the last one still rendered read-only — which would have made
  // "Add section → Description" produce an empty div nothing could be typed in.
  const { root } = renderBlock(
    t,
    creature("5.5e", { descriptionHtml: { characteristics: "<p>A pale figure.</p>" } }),
  );

  const body = root.querySelector(
    '.sb-description [data-section="characteristics"] [contenteditable="true"]',
  );
  assert.ok(body, "on the page");
  assert.match(body!.textContent ?? "", /A pale figure/);
});

test("5e Traits keeps its headingless print, trash and all", (t) => {
  // The 2014 block genuinely prints no "Traits" heading, so the trash rides the
  // body instead of a heading row.
  const { root } = renderBlock(t, creature("5e"), { revealedSections: ["traits"] });

  const wrapper = root.querySelector(".sb-traits-removable");
  assert.ok(wrapper, "the body carries the control");
  assert.ok(wrapper!.querySelector('[aria-label="Remove Traits"]'));
  assert.deepEqual(
    [...root.querySelectorAll(".statblock h4")].map((h) => (h.textContent ?? "").trim()),
    [],
    "and no heading was invented for it",
  );
});

test("a lookup takes the artwork's column", (t) => {
  // The frame is a whole browse page; a picture and an offer of a new section
  // are not what the author opened it for.
  const lookup = new LookupController();
  const { root } = renderBlock(t, creature("5e", { image: "https://example.test/a.png" }), {
    lookup,
  });
  assert.ok(root.querySelector(".sb-image"), "the artwork, to begin with");

  lookup.open({
    kind: kindByMacro("spells")!,
    query: "fireb",
    onPick: () => {},
    onCancel: () => {},
  });

  assert.ok(root.querySelector(".lf-frame"), "D&D Beyond's own page");
  assert.equal(root.querySelector(".sb-image"), null);
  assert.equal(root.querySelector(".sb-add-section"), null);

  lookup.cancel();
});
