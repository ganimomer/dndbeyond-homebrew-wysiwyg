import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { LookupOptions, ReferenceSource, RefToken } from "../adapter/types.js";
import { RefPreloader, type Schedule } from "./ref-preload.js";

/**
 * A real shadow root, with the idle scheduling injected so the tests decide
 * when a pass runs rather than waiting on the browser.
 */

interface Asked {
  token: RefToken;
  options: LookupOptions | undefined;
}

function stubSource() {
  const asked: Asked[] = [];
  const source: ReferenceSource = {
    async lookup(token, options) {
      asked.push({ token, options });
      return null;
    },
  };
  return { source, asked };
}

/** A `Schedule` the test triggers by hand. */
function manualSchedule() {
  let pending: (() => void) | null = null;
  let cancelled = 0;
  const schedule: Schedule = (run) => {
    pending = run;
    return () => {
      pending = null;
      cancelled++;
    };
  };
  return {
    schedule,
    get cancelled() {
      return cancelled;
    },
    /** Runs whatever is scheduled. Returns whether there was anything. */
    flush(): boolean {
      const run = pending;
      pending = null;
      run?.();
      return run !== null;
    },
  };
}

const CONDITION = (name: string) => `<span class="ref" data-ref="condition">${name}</span>`;

function mount(t: TestContext, markup: string, options: { limit?: number; settleMs?: number } = {}) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(host);
  const { source, asked } = stubSource();
  const clock = manualSchedule();
  const preloader = new RefPreloader({
    scope: root,
    source,
    schedule: clock.schedule,
    settleMs: options.settleMs ?? 300,
    limit: options.limit,
  });
  t.after(() => {
    preloader.stop();
    host.remove();
  });
  return { root, asked, clock, preloader };
}

/** MutationObserver callbacks are delivered as a microtask. */
const flush = () => Promise.resolve();

test("every reference in the block is asked about once", (t) => {
  const { asked, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")} ${CONDITION("Prone")}</p>`);
  preloader.start();
  clock.flush();

  assert.deepEqual(
    asked.map((a) => a.token.text),
    ["Grappled", "Prone"],
  );
});

test("a reference named three times is one lookup", (t) => {
  const markup = `<p>${CONDITION("Grappled")}</p><p>${CONDITION("Grappled")}</p><p>${CONDITION("Grappled")}</p>`;
  const { asked, clock, preloader } = mount(t, markup);
  preloader.start();
  clock.flush();

  assert.equal(asked.length, 1);
});

test("preloading is always background work", (t) => {
  // It must yield to a hover at the queue, and tell the browser to
  // deprioritise the request. Nobody is waiting on it.
  const { asked, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`);
  preloader.start();
  clock.flush();

  assert.deepEqual(asked[0]?.options, { priority: "background" });
});

test("a macro type we don't understand is never asked about", (t) => {
  const markup = `<span class="ref" data-ref="sidekick">Whoever</span>${CONDITION("Prone")}`;
  const { asked, clock, preloader } = mount(t, markup);
  preloader.start();
  clock.flush();

  assert.deepEqual(asked.map((a) => a.token.text), ["Prone"]);
});

test("nothing is scanned synchronously — the sections may not have mounted yet", (t) => {
  const { asked, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`);
  preloader.start();

  assert.deepEqual(asked, [], "start() scanned before its scheduled pass");
});

test("a reference that appears later is picked up", async (t) => {
  const { root, asked, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`, {
    settleMs: 0,
  });
  preloader.start();
  clock.flush();
  assert.equal(asked.length, 1);

  root.querySelector("p")!.insertAdjacentHTML("beforeend", CONDITION("Prone"));
  await flush();
  await new Promise((r) => setTimeout(r, 5));
  clock.flush();

  assert.deepEqual(asked.map((a) => a.token.text), ["Grappled", "Prone"]);
});

test("a burst of changes costs one pass", async (t) => {
  const { root, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`, { settleMs: 0 });
  preloader.start();
  clock.flush();

  const paragraph = root.querySelector("p")!;
  for (let i = 0; i < 10; i++) paragraph.insertAdjacentHTML("beforeend", `<b>${i}</b>`);
  await flush();
  await new Promise((r) => setTimeout(r, 5));

  assert.equal(clock.flush(), true, "the burst should have scheduled a pass");
  assert.equal(clock.flush(), false, "and only one");
});

test("rescanning an unchanged block asks about nothing", (t) => {
  const { asked, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`);
  preloader.start();
  clock.flush();
  const first = asked.length;

  assert.equal(preloader.scan(), 0);
  assert.equal(asked.length, first);
});

test("the limit caps how much one panel session will ask for", (t) => {
  const markup = Array.from({ length: 10 }, (_, i) => CONDITION(`C${i}`)).join(" ");
  const { asked, clock, preloader } = mount(t, markup, { limit: 4 });
  preloader.start();
  clock.flush();

  assert.equal(asked.length, 4);
});

test("stop() cancels a scheduled pass and stops watching", async (t) => {
  const { root, asked, clock, preloader } = mount(t, `<p>${CONDITION("Grappled")}</p>`, {
    settleMs: 0,
  });
  preloader.start();
  preloader.stop();

  assert.equal(clock.cancelled, 1, "the pending pass was not cancelled");

  root.querySelector("p")!.insertAdjacentHTML("beforeend", CONDITION("Prone"));
  await flush();
  await new Promise((r) => setTimeout(r, 5));
  clock.flush();

  assert.deepEqual(asked, []);
});

test("a pass that fires after stop() does nothing", (t) => {
  // Some browsers deliver an idle callback even after it was cancelled, so the
  // callback itself has to check rather than trusting the canceller.
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<p>${CONDITION("Grappled")}</p>`;
  document.body.append(host);
  t.after(() => host.remove());

  const { source, asked } = stubSource();
  let escaped: (() => void) | null = null;
  const preloader = new RefPreloader({
    scope: root,
    source,
    // A canceller that does nothing, so the pass survives `stop()`.
    schedule: (run) => ((escaped = run), () => {}),
  });
  preloader.start();
  preloader.stop();
  escaped?.();

  assert.deepEqual(asked, []);
});

test("scanning never touches the block", (t) => {
  // The same rule the hover controller lives by: Lexical's observer reverts
  // DOM it didn't author, so ours must only ever read.
  const markup = `<p>${CONDITION("Grappled")} and ${CONDITION("Prone")}</p>`;
  const { root, clock, preloader } = mount(t, markup);
  const before = root.innerHTML;

  preloader.start();
  clock.flush();

  assert.equal(root.innerHTML, before);
});
