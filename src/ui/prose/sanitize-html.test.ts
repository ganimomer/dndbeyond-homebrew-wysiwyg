import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "./sanitize-html.js";

/**
 * The read-only render path's filter. Its guarantees were unpinned until the
 * reference payloads had to come through it, so this covers the widening *and*
 * everything it must not have loosened.
 */
function clean(html: string): string {
  const host = document.createElement("div");
  host.appendChild(sanitizeHtml(html));
  return host.innerHTML;
}

test("formatting tags survive", () => {
  assert.equal(clean("<p>a <strong>b</strong> <em>c</em></p>"), "<p>a <strong>b</strong> <em>c</em></p>");
});

test("a reference keeps the payload the tooltip needs to resolve it", () => {
  assert.equal(
    clean(`<span class="ref" data-ref="rules" data-slug="shape-shifting">shape-shifts</span>`),
    `<span class="ref" data-ref="rules" data-slug="shape-shifting">shape-shifts</span>`,
  );
});

test("a reference with no slug keeps its type", () => {
  assert.equal(
    clean(`<span class="ref" data-ref="condition">Grappled</span>`),
    `<span class="ref" data-ref="condition">Grappled</span>`,
  );
});

test("a roll keeps its payload", () => {
  assert.match(clean(`<span class="roll" data-roll="{&quot;x&quot;:1}">+9</span>`), /data-roll=/);
});

test("a payload of the wrong shape is dropped, the token is not", () => {
  const out = clean(`<span class="ref" data-ref="<img>" data-slug="ok">Text</span>`);
  assert.equal(out, `<span class="ref" data-slug="ok">Text</span>`);
});

test("an unrecognised span keeps its text but loses its class", () => {
  // The regression this guards: dropping the class must not drop the words.
  assert.equal(clean(`<span class="mce-bogus" data-x="1">kept</span>`), `<span>kept</span>`);
});

test("a script is dropped and its text with it", () => {
  assert.equal(clean(`<p>a</p><script>alert(1)</script>`), `<p>a</p>`);
});

test("an inline handler never survives", () => {
  assert.equal(clean(`<p onclick="alert(1)">a</p>`), `<p>a</p>`);
});

test("a javascript: href is dropped but the link text stays", () => {
  const out = clean(`<a href="javascript:alert(1)">click</a>`);
  assert.equal(out, `<a>click</a>`);
});

test("an ordinary link is rewritten to open safely elsewhere", () => {
  assert.equal(
    clean(`<a href="/spells/2065">Detect Magic</a>`),
    `<a href="/spells/2065" target="_blank" rel="noreferrer">Detect Magic</a>`,
  );
});

test("a disallowed element is unwrapped, keeping its children", () => {
  assert.equal(clean(`<div><p>inside</p></div>`), `<p>inside</p>`);
});

test("comments are dropped", () => {
  assert.equal(clean(`<p>a<!-- note -->b</p>`), `<p>ab</p>`);
});
