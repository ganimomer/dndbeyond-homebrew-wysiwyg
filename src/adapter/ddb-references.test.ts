import { test } from "node:test";
import assert from "node:assert/strict";
import { DdbReferenceSource } from "./ddb-references.js";

/**
 * The resolver's contract, checked against a recording fetch rather than the
 * live site: which requests a lookup makes, which it doesn't make twice, and
 * — the subtle one — which answers are worth remembering.
 *
 * The fixtures mirror real responses: DDB's tooltip endpoint answers a
 * parenthesised JSON literal, and its canonical slug URL 301s to a numbered
 * one, which `fetch` follows and reports as `res.url`.
 */

const ORIGIN = "https://ddb.test";

function envelope(body: Record<string, unknown>): string {
  return `(${JSON.stringify(body)})`;
}

const SPELL = envelope({
  Type: "spell",
  Id: 2065,
  Tooltip: `<div class="tooltip tooltip-spell">Detect Magic</div>`,
  Url: "https://www.dndbeyond.com/spells/2065/tooltip",
});

const CONDITION = envelope({
  Type: "condition",
  Id: 6,
  Tooltip: `<div class="tooltip tooltip-condition">Grappled</div>`,
});

/** A recording fetch. `routes` maps a URL to its response; anything else 404s. */
function stubFetch(routes: Record<string, { body?: string; url?: string; status?: number }>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("<!DOCTYPE html>", { status: 404 });
    const res = new Response(route.body ?? "", { status: route.status ?? 200 });
    // `Response.url` is read-only and empty on a constructed response, so stand
    // in for the redirect fetch would have followed.
    Object.defineProperty(res, "url", { value: route.url ?? url });
    return res;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("a harvested slug is resolved without asking DDB for the id", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: CONDITION },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "condition", text: "Grappled" });

  assert.equal(tooltip?.type, "condition");
  assert.match(tooltip?.html ?? "", /Grappled/);
  assert.deepEqual(calls, [`${ORIGIN}/conditions/6/tooltip`]);
});

test("an open-compendium name resolves through the slug redirect, in order", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/spells/detect-magic`]: { url: `${ORIGIN}/spells/2065-detect-magic` },
    [`${ORIGIN}/spells/2065/tooltip`]: { body: SPELL },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "spells", text: "Detect Magic" });

  assert.match(tooltip?.html ?? "", /Detect Magic/);
  assert.deepEqual(calls, [
    `${ORIGIN}/spells/detect-magic`,
    `${ORIGIN}/spells/2065/tooltip`,
  ]);
});

test("the same token hovered twice at once makes one request", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: CONDITION },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const [a, b] = await Promise.all([
    source.lookup({ ref: "condition", text: "Grappled" }),
    source.lookup({ ref: "condition", text: "Grappled" }),
  ]);

  assert.equal(a?.type, "condition");
  assert.equal(b?.type, "condition");
  assert.equal(calls.length, 1);
});

test("a resolved answer is remembered, so a second hover costs nothing", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: CONDITION },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.lookup({ ref: "condition", text: "Grappled" });
  await source.lookup({ ref: "condition", text: "Grappled" });

  assert.equal(calls.length, 1);
});

test("'there is nothing there' is remembered too", async () => {
  const { impl, calls } = stubFetch({});
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "spells", text: "Nonesuch" }), null);
  assert.equal(await source.lookup({ ref: "spells", text: "Nonesuch" }), null);

  assert.equal(calls.length, 1);
});

test("'we couldn't ask' is NOT remembered, so the next hover retries", async () => {
  // The distinction that matters: an offline blip must not poison the cache
  // for the rest of the session.
  let calls = 0;
  let offline = true;
  const impl = (async (input: RequestInfo | URL) => {
    calls++;
    if (offline) throw new TypeError("Failed to fetch");
    const res = new Response(CONDITION, { status: 200 });
    Object.defineProperty(res, "url", { value: String(input) });
    return res;
  }) as unknown as typeof fetch;
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "condition", text: "Grappled" }), null);
  offline = false;
  const recovered = await source.lookup({ ref: "condition", text: "Grappled" });

  assert.equal(recovered?.type, "condition");
  assert.equal(calls, 2);
});

test("an unknown macro type never reaches the network", async () => {
  const { impl, calls } = stubFetch({});
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "sidekick", text: "Whoever" }), null);
  assert.equal(calls.length, 0);
});

test("a paywalled reference returns DDB's own blocked tooltip", async () => {
  // Better than silence: it is styled, it explains itself, and it is exactly
  // what the author would see on dndbeyond.com.
  const blocked = envelope({
    Type: "blocked",
    Id: 0,
    Tooltip: `<div class="ddb-blocked-content">Unlock this book</div>`,
  });
  const { impl } = stubFetch({ [`${ORIGIN}/conditions/6/tooltip`]: { body: blocked } });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "condition", text: "Grappled" });

  assert.equal(tooltip?.type, "blocked");
  assert.match(tooltip?.html ?? "", /ddb-blocked-content/);
});

test("an empty tooltip body resolves to nothing rather than an empty popup", async () => {
  const { impl } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: envelope({ Type: "condition", Tooltip: "  " }) },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "condition", text: "Grappled" }), null);
});

test("a body that is bare JSON rather than parenthesised still parses", async () => {
  const { impl } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: JSON.stringify({ Type: "condition", Tooltip: "<p>x</p>" }) },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal((await source.lookup({ ref: "condition", text: "Grappled" }))?.html, "<p>x</p>");
});

test("a slug URL that doesn't redirect to a numbered page resolves to nothing", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/spells/detect-magic`]: { url: `${ORIGIN}/spells/detect-magic` },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "spells", text: "Detect Magic" }), null);
  assert.deepEqual(calls, [`${ORIGIN}/spells/detect-magic`]);
});

test("a hostile data-slug cannot smuggle a path into the URL", async () => {
  // `data-slug` comes out of HTML we did not author, so it is slugified before
  // it is ever a URL — separators, dots and query characters all collapse to
  // dashes. Nothing dangerous survives to need escaping.
  const { impl, calls } = stubFetch({});
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.lookup({ ref: "spells", slug: "../../admin?x=1", text: "Odd" });

  assert.deepEqual(calls, [`${ORIGIN}/spells/admin-x-1`]);
});
