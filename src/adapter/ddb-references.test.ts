import { test } from "node:test";
import assert from "node:assert/strict";
import { DdbReferenceSource } from "./ddb-references.js";
import { TaskQueue } from "./task-queue.js";
import type { ReferenceIdStore } from "./reference-id-store.js";
import type { ReferenceTarget } from "./ddb-reference-map.js";

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

/** A store that already knows some ids and records nothing by default. */
function fixedStore(ids: Record<string, number>): ReferenceIdStore {
  return {
    ready: Promise.resolve(),
    get: (target: ReferenceTarget) => ids[`${target.path}/${target.slug}`] ?? null,
    remember: () => {},
    flush: async () => {},
  };
}

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

test("a compendium with no page of its own is looked up where DDB browses it", async () => {
  // Armor has no page: `/armor/chain-mail` 404s, and every piece of it is
  // browsed at `/equipment` instead. The *tooltip* still comes from `/armor`,
  // because the macro already says which of the three compendiums sharing that
  // listing this is — so the id off the redirect is the one `/armor` wants.
  const ARMOR = envelope({
    Type: "armor",
    Id: 16,
    Tooltip: `<div class="tooltip tooltip-armor">Chain Mail</div>`,
  });
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/equipment/chain-mail`]: { url: `${ORIGIN}/equipment/16-chain-mail` },
    [`${ORIGIN}/armor/16/tooltip`]: { body: ARMOR },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "armor", text: "Chain Mail" });

  assert.equal(tooltip?.type, "armor");
  assert.deepEqual(calls, [
    `${ORIGIN}/equipment/chain-mail`,
    `${ORIGIN}/armor/16/tooltip`,
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

test("a third simultaneous lookup is served, not silently dropped", async () => {
  // This used to be a latent bug: at the in-flight cap, `lookup` returned null
  // and threw the request away, so the token stayed blank until re-hovered.
  // Preloading would have hit it constantly.
  const routes: Record<string, { body?: string }> = {};
  for (const id of [1, 2, 3, 4, 5, 6]) {
    routes[`${ORIGIN}/conditions/${id}/tooltip`] = {
      body: envelope({ Type: "condition", Id: id, Tooltip: `<div>c${id}</div>` }),
    };
  }
  const { impl } = stubFetch(routes);
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const names = ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled"];
  const answers = await Promise.all(
    names.map((text) => source.lookup({ ref: "condition", text })),
  );

  assert.equal(answers.filter(Boolean).length, names.length, "some lookups were dropped");
});

test("a hovered reference overtakes preloads already queued", async () => {
  // One slot wide, so ordering is fully observable: the hover must not wait
  // behind the backlog.
  const routes: Record<string, { body?: string }> = {};
  for (const id of [1, 2, 3, 6]) {
    routes[`${ORIGIN}/conditions/${id}/tooltip`] = {
      body: envelope({ Type: "condition", Id: id, Tooltip: `<div>c${id}</div>` }),
    };
  }
  const { impl, calls } = stubFetch(routes);
  const source = new DdbReferenceSource({
    fetchImpl: impl,
    origin: ORIGIN,
    queue: new TaskQueue({ limit: 2, backgroundLimit: 1 }),
  });

  const preloads = ["Blinded", "Charmed", "Deafened"].map((text) =>
    source.lookup({ ref: "condition", text }, { priority: "background" }),
  );
  const hover = source.lookup({ ref: "condition", text: "Grappled" });
  await Promise.all([...preloads, hover]);

  // The preload that was already running keeps its slot — we don't cancel work
  // nearly done. What matters is that the hover goes next, rather than waiting
  // out the rest of the backlog.
  const hoverAt = calls.indexOf(`${ORIGIN}/conditions/6/tooltip`);
  const stillQueued = [`${ORIGIN}/conditions/2/tooltip`, `${ORIGIN}/conditions/3/tooltip`];
  for (const url of stillQueued) {
    assert.ok(
      hoverAt < calls.indexOf(url),
      `the hover should precede the queued preloads, got ${calls.join(", ")}`,
    );
  }
});

test("the pointer catching up with a running preload does not ask twice", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/conditions/6/tooltip`]: { body: CONDITION },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const preload = source.lookup({ ref: "condition", text: "Grappled" }, { priority: "background" });
  const hover = source.lookup({ ref: "condition", text: "Grappled" });

  assert.equal((await hover)?.type, "condition");
  assert.equal((await preload)?.type, "condition");
  assert.equal(calls.length, 1);
});

test("dropPending() discards preloads but leaves hovers alone", async () => {
  const routes: Record<string, { body?: string }> = {};
  for (const id of [1, 2, 6]) {
    routes[`${ORIGIN}/conditions/${id}/tooltip`] = {
      body: envelope({ Type: "condition", Id: id, Tooltip: `<div>c${id}</div>` }),
    };
  }
  const { impl, calls } = stubFetch(routes);
  const source = new DdbReferenceSource({
    fetchImpl: impl,
    origin: ORIGIN,
    queue: new TaskQueue({ limit: 2, backgroundLimit: 1 }),
  });

  const hover = source.lookup({ ref: "condition", text: "Grappled" });
  const running = source.lookup({ ref: "condition", text: "Blinded" }, { priority: "background" });
  const queued = source.lookup({ ref: "condition", text: "Charmed" }, { priority: "background" });
  source.dropPending();

  assert.equal((await hover)?.type, "condition", "the hover was disturbed");
  // A preload already in flight is left to finish — cancelling work that is
  // nearly done buys nothing. Only what is still queued is discarded.
  assert.equal((await running)?.type, "condition");
  assert.equal(await queued, null, "a dropped preload should resolve null");
  assert.ok(
    !calls.includes(`${ORIGIN}/conditions/2/tooltip`),
    `the dropped preload should never have been fetched, got ${calls.join(", ")}`,
  );
});

test("a dropped preload is not remembered as an answer", async () => {
  // Being discarded is a non-answer, like an offline blip — reopening the
  // panel must retry rather than inherit a null.
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/conditions/1/tooltip`]: { body: envelope({ Type: "condition", Tooltip: "<p>x</p>" }) },
  });
  const source = new DdbReferenceSource({
    fetchImpl: impl,
    origin: ORIGIN,
    queue: new TaskQueue({ limit: 2, backgroundLimit: 1 }),
  });

  const blocker = source.lookup({ ref: "condition", text: "Grappled" });
  const dropped = source.lookup({ ref: "condition", text: "Blinded" }, { priority: "background" });
  source.dropPending();
  await Promise.all([blocker, dropped]);

  const retried = await source.lookup({ ref: "condition", text: "Blinded" });

  assert.equal(retried?.html, "<p>x</p>");
  assert.ok(calls.includes(`${ORIGIN}/conditions/1/tooltip`));
});

test("a learned id skips the redirect probe entirely", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/spells/2065/tooltip`]: { body: SPELL },
  });
  const source = new DdbReferenceSource({
    fetchImpl: impl,
    origin: ORIGIN,
    idStore: fixedStore({ "spells/detect-magic": 2065 }),
  });

  const tooltip = await source.lookup({ ref: "spells", text: "Detect Magic" });

  assert.match(tooltip?.html ?? "", /Detect Magic/);
  assert.deepEqual(calls, [`${ORIGIN}/spells/2065/tooltip`], "the slug probe should not have run");
});

test("an id learned from a redirect is handed to the store", async () => {
  const remembered: Array<[string, number]> = [];
  const { impl } = stubFetch({
    [`${ORIGIN}/spells/detect-magic`]: { url: `${ORIGIN}/spells/2065-detect-magic` },
    [`${ORIGIN}/spells/2065/tooltip`]: { body: SPELL },
  });
  const store = fixedStore({});
  store.remember = (target, id) => remembered.push([`${target.path}/${target.slug}`, id]);
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN, idStore: store });

  await source.lookup({ ref: "spells", text: "Detect Magic" });

  assert.deepEqual(remembered, [["spells/detect-magic", 2065]]);
});

test("a background lookup asks the browser to deprioritise it", async () => {
  const inits: Array<RequestInit & { priority?: string }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    inits.push((init ?? {}) as RequestInit & { priority?: string });
    const res = new Response(CONDITION, { status: 200 });
    Object.defineProperty(res, "url", { value: String(input) });
    return res;
  }) as unknown as typeof fetch;
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.lookup({ ref: "condition", text: "Grappled" }, { priority: "background" });
  await source.lookup({ ref: "condition", text: "Charmed" });

  assert.equal(inits[0]?.priority, "low");
  assert.equal(inits[1]?.priority, undefined, "an interactive fetch should carry no hint");
});

/**
 * `[items]` — the one macro that doesn't say which compendium it means.
 *
 * D&D Beyond writes the 2024 Gear row with it (`[items]Greatsword[/items]`)
 * and a magic item with it too, and the four compendiums it could mean number
 * their contents *separately*: `/weapons/17` is a Shortbow and `/armor/17` is
 * Splint, both real, both answering 200 to the id that `/equipment/splint`
 * hands back. So the first candidate that answers is not the answer — which is
 * what these are about.
 *
 * The header shapes are theirs: a weapon puts the name in the title div as
 * text, a magic item wraps it in a span, and both hang a Legacy badge beside it.
 */
const titled = (type: string, id: number, name: string) =>
  envelope({
    Type: type,
    Id: id,
    Tooltip:
      `<div class="tooltip tooltip-${type}"><div class="tooltip-header">` +
      `<div class="tooltip-header-text"><div class="tooltip-header-title">${name} ` +
      `<span class="badge"><span class="badge-label">Legacy</span>` +
      `<span class="badge-text">This doesn't reflect the latest rules and lore.</span></span>` +
      `</div></div></div><div class="tooltip-body">…</div></div>`,
  });

test("[items] resolves a magic item on the first candidate", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/magic-items/bag-of-holding`]: { url: `${ORIGIN}/magic-items/4581-bag-of-holding` },
    [`${ORIGIN}/magic-items/4581/tooltip`]: {
      // Their magic-item header wraps the name rather than writing it inline.
      body: envelope({
        Type: "magic-item",
        Id: 4581,
        Tooltip: `<div class="tooltip-header-title"><span>Bag of Holding</span></div>`,
      }),
    },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "items", text: "Bag of Holding" });

  assert.equal(tooltip?.type, "magic-item");
  assert.deepEqual(calls, [
    `${ORIGIN}/magic-items/bag-of-holding`,
    `${ORIGIN}/magic-items/4581/tooltip`,
  ]);
});

test("[items] falls through to the equipment compendiums when it isn't magic", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/equipment/greatsword`]: { url: `${ORIGIN}/equipment/22-greatsword` },
    [`${ORIGIN}/weapons/22/tooltip`]: { body: titled("weapon", 22, "Greatsword") },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "items", text: "Greatsword" });

  assert.equal(tooltip?.type, "weapon");
  assert.deepEqual(calls, [
    `${ORIGIN}/magic-items/greatsword`,
    `${ORIGIN}/equipment/greatsword`,
    `${ORIGIN}/weapons/22/tooltip`,
  ]);
});

test("[items] refuses a candidate that answers about something else", async () => {
  // The one that matters. `/equipment/splint` hands back 17, and `/weapons/17`
  // answers — with a Shortbow. Believed, that is Splint Armor explained as a
  // bow, in D&D Beyond's own styling, with nothing on screen to say it's wrong.
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/equipment/splint`]: { url: `${ORIGIN}/equipment/17-splint` },
    [`${ORIGIN}/weapons/17/tooltip`]: { body: titled("weapon", 17, "Shortbow") },
    [`${ORIGIN}/armor/17/tooltip`]: { body: titled("armor", 17, "Splint") },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({ ref: "items", slug: "splint", text: "Splint Armor" });

  assert.equal(tooltip?.type, "armor");
  assert.match(tooltip?.html ?? "", /Splint/);
  assert.deepEqual(
    calls,
    [
      `${ORIGIN}/magic-items/splint`,
      // One probe, not three: the three equipment compendiums share a page.
      `${ORIGIN}/equipment/splint`,
      `${ORIGIN}/weapons/17/tooltip`,
      `${ORIGIN}/armor/17/tooltip`,
    ],
    "the redirect is paid once and the wrong compendium costs one cheap tooltip",
  );
});

test("[items] checks the name DDB landed on, not the words in the macro", async () => {
  // The display text is the author's; the slug in the numbered URL is DDB's,
  // and it is the one the header's name is built from. `Heavy Crossbow` never
  // matches `Crossbow, Heavy` as words — as slugs they are the same answer.
  const { impl } = stubFetch({
    [`${ORIGIN}/equipment/crossbow-heavy`]: { url: `${ORIGIN}/equipment/36-crossbow-heavy` },
    [`${ORIGIN}/weapons/36/tooltip`]: { body: titled("weapon", 36, "Crossbow, Heavy") },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  const tooltip = await source.lookup({
    ref: "items",
    slug: "crossbow, heavy",
    text: "Heavy Crossbow",
  });

  assert.equal(tooltip?.type, "weapon");
});

test("[items] that fits nowhere resolves to nothing rather than to the last try", async () => {
  const { impl } = stubFetch({
    [`${ORIGIN}/equipment/gizmo`]: { url: `${ORIGIN}/equipment/99-gizmo` },
    [`${ORIGIN}/weapons/99/tooltip`]: { body: titled("weapon", 99, "Club") },
    [`${ORIGIN}/armor/99/tooltip`]: { body: titled("armor", 99, "Shield") },
    [`${ORIGIN}/adventuring-gear/99/tooltip`]: { body: titled("gear", 99, "Torch") },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.lookup({ ref: "items", text: "Gizmo" }), null);
});

test("a macro that names its compendium is not second-guessed", async () => {
  // `[armor]` has already said which of the three this is, so the tooltip that
  // came back *is* the answer. Checking the name here could only throw away a
  // good one over a header DDB words differently from its own slug — and one
  // compendium (conditions) doesn't put a title in the header at all.
  const { impl } = stubFetch({
    [`${ORIGIN}/equipment/chain-mail`]: { url: `${ORIGIN}/equipment/16-chain-mail` },
    [`${ORIGIN}/armor/16/tooltip`]: {
      body: envelope({ Type: "armor", Id: 16, Tooltip: `<div class="body">Nothing named</div>` }),
    },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal((await source.lookup({ ref: "armor", text: "Chain Mail" }))?.type, "armor");
});

test("an [items] answer is remembered under a key of its own", async () => {
  // `[items]Greatsword[/items]` and `[weapon]Greatsword[/weapon]` are different
  // questions — one has said which compendium and the other hasn't — so a
  // cached answer to one must not be handed to the other.
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/equipment/greatsword`]: { url: `${ORIGIN}/equipment/22-greatsword` },
    [`${ORIGIN}/weapons/22/tooltip`]: { body: titled("weapon", 22, "Greatsword") },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.lookup({ ref: "items", text: "Greatsword" });
  const before = calls.length;
  await source.lookup({ ref: "items", text: "Greatsword" });
  assert.equal(calls.length, before, "the same question is asked once");

  await source.lookup({ ref: "weapon", text: "Greatsword" });
  assert.ok(calls.length > before, "a different question is asked");
});

/**
 * `blocked()` — the same endpoint, asked whether the author may read the thing
 * rather than what it says. The distinction that matters throughout is between
 * D&D Beyond refusing (which is an answer) and D&D Beyond not answering at all;
 * only the first is worth marking a row on, and only the first is remembered.
 */

const BLOCKED = envelope({
  Type: "blocked",
  Id: 0,
  Tooltip: `<div class="ddb-blocked-tooltip">Unlock this content</div>`,
});

test("a paywalled record is blocked, and one the author owns is not", async () => {
  const { impl } = stubFetch({
    [`${ORIGIN}/monsters/175326/tooltip`]: { body: BLOCKED },
    [`${ORIGIN}/monsters/17043/tooltip`]: {
      body: envelope({ Type: "monster", Id: 17043, Tooltip: "<div>Vampire</div>" }),
    },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.blocked("monsters", 175326), true);
  assert.equal(await source.blocked("monsters", 17043), false);
});

test("a response that isn't an answer is not a refusal", async () => {
  // Measured against the live endpoint: the author's own homebrew answers 500
  // there, and an id that names no creature answers 404. Neither is D&D Beyond
  // saying no, and a row marked on either would be marked wrongly.
  const { impl } = stubFetch({
    [`${ORIGIN}/monsters/6700407/tooltip`]: { status: 500, body: "<!DOCTYPE html>" },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.blocked("monsters", 6700407), null, "their own homebrew");
  assert.equal(await source.blocked("monsters", 99999999), null, "no such creature");
});

test("a network that never answered is not a refusal either", async () => {
  const impl = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  assert.equal(await source.blocked("monsters", 175326), null);
});

test("an answer is remembered, and a non-answer is asked again", async () => {
  const { impl, calls } = stubFetch({
    [`${ORIGIN}/monsters/175326/tooltip`]: { body: BLOCKED },
  });
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.blocked("monsters", 175326);
  await source.blocked("monsters", 175326);
  assert.equal(calls.length, 1, "a settled answer costs one request");

  const before = calls.length;
  await source.blocked("monsters", 404404);
  await source.blocked("monsters", 404404);
  assert.equal(calls.length, before + 2, "but silence is worth asking about again");
});

test("a sweep is background work, and yields its slot to a hover", async () => {
  const routes: Record<string, { body?: string }> = {
    [`${ORIGIN}/conditions/6/tooltip`]: { body: CONDITION },
  };
  for (const id of [1, 2, 3]) {
    routes[`${ORIGIN}/monsters/${id}/tooltip`] = { body: BLOCKED };
  }
  const { impl, calls } = stubFetch(routes);
  const source = new DdbReferenceSource({
    fetchImpl: impl,
    origin: ORIGIN,
    queue: new TaskQueue({ limit: 2, backgroundLimit: 1 }),
  });

  // A listing's worth of rows, then someone hovers a chip in their own prose.
  const sweep = [1, 2, 3].map((id) => source.blocked("monsters", id));
  const hover = source.lookup({ ref: "condition", text: "Grappled" });
  await Promise.all([...sweep, hover]);

  const hoverAt = calls.indexOf(`${ORIGIN}/conditions/6/tooltip`);
  for (const id of [2, 3]) {
    assert.ok(
      hoverAt < calls.indexOf(`${ORIGIN}/monsters/${id}/tooltip`),
      `the hover should precede the queued sweep, got ${calls.join(", ")}`,
    );
  }
});

test("asking about a row does not deprioritise a caller who says otherwise", async () => {
  const inits: Array<RequestInit & { priority?: string }> = [];
  const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    inits.push((init ?? {}) as RequestInit & { priority?: string });
    return new Response(BLOCKED, { status: 200 });
  }) as unknown as typeof fetch;
  const source = new DdbReferenceSource({ fetchImpl: impl, origin: ORIGIN });

  await source.blocked("monsters", 1);
  await source.blocked("monsters", 2, { priority: "interactive" });

  assert.equal(inits[0]?.priority, "low", "a sweep is background by default");
  assert.equal(inits[1]?.priority, undefined, "unlike a lookup, whose default is a hover");
});
