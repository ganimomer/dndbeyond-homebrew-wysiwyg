import { test } from "node:test";
import assert from "node:assert/strict";
import { tooltipFragment } from "./tooltip-html.js";

/** The fragment's markup, for asserting on. */
function html(fragment: DocumentFragment): string {
  const host = document.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}

test("D&D Beyond's own structure and classes survive untouched", () => {
  // This is the whole point: their stylesheet keys on this markup, so anything
  // that rewrote it would cost us the styling we came for.
  const source =
    `<div class="tooltip tooltip-spell">` +
    `<div class="tooltip-header"><div class="tooltip-header-title">Detect Magic</div></div>` +
    `<div class="tooltip-body"><p>For the duration…</p></div>` +
    `</div>`;
  assert.equal(html(tooltipFragment(source)), source);
});

test("a script is dropped whole", () => {
  const out = html(tooltipFragment(`<div class="tooltip"><script>alert(1)</script>ok</div>`));
  assert.equal(out, `<div class="tooltip">ok</div>`);
});

test("frames and embeds are dropped", () => {
  for (const tag of ["iframe", "object", "embed", "form", "input"]) {
    const out = html(tooltipFragment(`<div><${tag}></${tag}>text</div>`));
    assert.ok(!out.includes(`<${tag}`), `${tag} survived: ${out}`);
  }
});

test("inline handlers come off, the element stays", () => {
  const out = html(tooltipFragment(`<img class="icon" src="/i.png" onerror="alert(1)">`));
  assert.ok(!out.includes("onerror"));
  assert.match(out, /class="icon"/);
  assert.match(out, /src="\/i\.png"/);
});

test("a javascript: target is dropped but the link's text is kept", () => {
  const out = html(tooltipFragment(`<a href="javascript:alert(1)">Magic</a>`));
  assert.ok(!out.includes("javascript:"));
  assert.match(out, />Magic</);
});

test("an ordinary href is left alone", () => {
  const out = html(tooltipFragment(`<a class="tooltip-hover" href="/actions/2">Magic</a>`));
  assert.match(out, /href="\/actions\/2"/);
});

test("ids come off, so injected markup can't collide with the page", () => {
  const out = html(tooltipFragment(`<div id="db-tooltip-container" class="tooltip">x</div>`));
  assert.ok(!out.includes("id="));
  assert.match(out, /class="tooltip"/);
});
