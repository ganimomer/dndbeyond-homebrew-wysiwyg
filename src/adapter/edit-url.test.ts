import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsUrl, renamedEditUrl } from "./edit-url.js";

const EDIT = "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-copy_of_vampire/edit";

test("a reslugged response is the URL to move to", () => {
  assert.equal(
    renamedEditUrl(
      EDIT,
      "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-vampire_lord/edit",
    ),
    "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-vampire_lord/edit",
  );
});

test("a save that didn't rename anything stays put", () => {
  assert.equal(renamedEditUrl(EDIT, EDIT), null);
});

test("the slug may appear or disappear entirely", () => {
  const slugless = "https://www.dndbeyond.com/homebrew/creations/monsters/6700407/edit";
  assert.equal(renamedEditUrl(EDIT, slugless), slugless);
  assert.equal(renamedEditUrl(slugless, EDIT), EDIT);
});

test("a redirect away from the editor never moves us", () => {
  for (const elsewhere of [
    "https://www.dndbeyond.com/sign-in?returnUrl=%2Fhomebrew",
    "https://www.dndbeyond.com/error",
    "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-copy_of_vampire",
    "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-copy_of_vampire/delete",
  ]) {
    assert.equal(renamedEditUrl(EDIT, elsewhere), null, elsewhere);
  }
});

test("another monster's edit page never moves us", () => {
  assert.equal(
    renamedEditUrl(
      EDIT,
      "https://www.dndbeyond.com/homebrew/creations/monsters/6700408-copy_of_vampire/edit",
    ),
    null,
  );
});

test("a cross-origin response never moves us", () => {
  assert.equal(
    renamedEditUrl(
      EDIT,
      "https://evil.example.com/homebrew/creations/monsters/6700407-vampire_lord/edit",
    ),
    null,
  );
});

test("a query string alone is not a rename", () => {
  assert.equal(renamedEditUrl(EDIT, `${EDIT}?saved=1`), null);
});

test("a trailing slash alone is not a rename", () => {
  assert.equal(renamedEditUrl(EDIT, `${EDIT}/`), null);
});

test("unparseable URLs are shrugged off", () => {
  assert.equal(renamedEditUrl(EDIT, "not a url"), null);
  assert.equal(renamedEditUrl(EDIT, "/homebrew/creations/monsters/6700407-lord/edit"), null);
  assert.equal(renamedEditUrl("", EDIT), null);
});

test("the details page is the edit URL's id-and-slug, one level up", () => {
  assert.equal(detailsUrl(EDIT), "https://www.dndbeyond.com/monsters/6700407-copy_of_vampire");
  assert.equal(detailsUrl(`${EDIT}/`), "https://www.dndbeyond.com/monsters/6700407-copy_of_vampire");
  assert.equal(
    detailsUrl(`${EDIT}?saved=1`),
    "https://www.dndbeyond.com/monsters/6700407-copy_of_vampire",
  );
});

test("the details page keeps the origin it was found on", () => {
  assert.equal(
    detailsUrl("https://staging.dndbeyond.com/homebrew/creations/monsters/1-goblin/edit"),
    "https://staging.dndbeyond.com/monsters/1-goblin",
  );
});

test("a slugless edit URL names no details page", () => {
  // `/monsters/<id>` answers 404 — the slug isn't decoration, it's the address.
  assert.equal(detailsUrl("https://www.dndbeyond.com/homebrew/creations/monsters/6700407/edit"), null);
});

test("anywhere but a monster's edit page has no details page", () => {
  for (const elsewhere of [
    "https://www.dndbeyond.com/homebrew/creations/monsters",
    "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-vampire",
    "https://www.dndbeyond.com/homebrew/creations/monsters/6700407-vampire/delete",
    "https://www.dndbeyond.com/monsters/6700407-vampire",
    "/homebrew/creations/monsters/6700407-vampire/edit",
    "not a url",
    "",
  ]) {
    assert.equal(detailsUrl(elsewhere), null, elsewhere);
  }
});
