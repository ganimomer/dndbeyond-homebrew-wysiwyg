import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultImageUrl } from "./default-image.js";

test("maps a base type to its DDB image URL", () => {
  assert.equal(
    defaultImageUrl("undead"),
    "https://www.dndbeyond.com/attachments/2/660/undead.jpg",
  );
  assert.equal(
    defaultImageUrl("humanoid"),
    "https://www.dndbeyond.com/attachments/2/656/humanoid.jpg",
  );
});

test("is case-insensitive and trims (DDB's 5.5e types are capitalized)", () => {
  assert.equal(
    defaultImageUrl("Undead"),
    "https://www.dndbeyond.com/attachments/2/660/undead.jpg",
  );
  assert.equal(
    defaultImageUrl("  Beast  "),
    "https://www.dndbeyond.com/attachments/2/648/beast.jpg",
  );
});

test("returns undefined for empty, placeholder, or unknown types", () => {
  assert.equal(defaultImageUrl(""), undefined);
  assert.equal(defaultImageUrl(undefined), undefined);
  assert.equal(defaultImageUrl("Choose a Type"), undefined);
  assert.equal(defaultImageUrl("aarakocra"), undefined); // a subtype, not a base type
});

test("covers all 14 standard base creature types", () => {
  const types = [
    "aberration", "beast", "celestial", "construct", "dragon", "elemental",
    "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
  ];
  for (const t of types) {
    assert.match(defaultImageUrl(t) ?? "", /^https:\/\/www\.dndbeyond\.com\/attachments\/2\/\d+\/.+\.jpg$/);
  }
});
