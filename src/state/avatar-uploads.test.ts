/**
 * The avatar upload's own rules: it saves at once rather than on the debounce,
 * it shows the picture before D&D Beyond has it, and it puts that picture back
 * if the save doesn't land.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AvatarSize, PageAdapter } from "../adapter/types.js";
import { AutosaveController } from "../editor/autosave.js";
import { AvatarUploads } from "./avatar-uploads.js";
import { emptySession, type SessionState } from "./session.js";

// Long enough that a save happening at all proves the debounce was skipped.
const DEBOUNCE = 100_000;
const RETRY = 50;

/** Lets pending promise callbacks run without advancing the clock. */
const settle = () => new Promise((r) => setImmediate(r));

const png = (name = "portrait.png") => new File(["x"], name, { type: "image/png" });

function harness(problem: string | null = null) {
  let session: SessionState = emptySession();
  const cleared: AvatarSize[] = [];
  const picked: AvatarSize[] = [];
  let chosen: ((size: AvatarSize, file: File) => void) | null = null;

  const adapter = {
    chooseAvatar: (size: AvatarSize) => {
      picked.push(size);
      return true;
    },
    avatarProblem: () => problem,
    onAvatarChosen: (handler: (size: AvatarSize, file: File) => void) => {
      chosen = handler;
      return () => {
        chosen = null;
      };
    },
    clearAvatar: (size: AvatarSize) => void cleared.push(size),
  } as unknown as PageAdapter;

  const settlers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  let calls = 0;
  const autosave = new AutosaveController(
    () => {
      calls++;
      return new Promise<void>((resolve, reject) => settlers.push({ resolve, reject }));
    },
    { debounceMs: DEBOUNCE, retryDelayMs: RETRY },
  );

  const uploads = new AvatarUploads(adapter, autosave, {
    getSession: () => session,
    update: (patch) => {
      session = { ...session, ...patch };
    },
  });
  uploads.start();

  return {
    uploads,
    autosave,
    cleared,
    picked,
    get saves() {
      return calls;
    },
    get session() {
      return session;
    },
    status: (size: AvatarSize) => session.avatarStatus.get(size),
    /** Stands in for the author picking a file in D&D Beyond's input. */
    pick: (size: AvatarSize, file = png()) => chosen?.(size, file),
    /** Settles the oldest outstanding save. */
    finish: (error?: Error) => {
      const s = settlers.shift();
      assert.ok(s, "expected an outstanding save call");
      if (error) s.reject(error);
      else s.resolve();
    },
  };
}

test("a chosen large avatar shows at once and saves without waiting for the debounce", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = harness();

  page.pick("large");
  await settle();

  const preview = page.session.avatarPreview;
  assert.ok(preview, "the artwork shows the file before it is saved");
  assert.equal(page.status("large")?.state, "saving");
  assert.equal(page.saves, 1, "saved immediately rather than in DEBOUNCE ms");

  page.finish();
  await settle();

  assert.equal(page.status("large")?.state, "success");
  assert.equal(page.session.avatarPreview, preview, "and goes on showing it");
  assert.deepEqual(page.cleared, ["large"], "the input is emptied so later saves don't re-post it");
});

test("a green tick gives way after a few seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = harness();

  page.pick("large");
  await settle();
  page.finish();
  await settle();
  assert.equal(page.status("large")?.state, "success");

  t.mock.timers.tick(3000);
  assert.equal(page.status("large"), undefined, "the artwork goes back to normal");
});

test("a save that never lands puts the old picture back and says so", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = harness();

  page.pick("large");
  await settle();
  assert.ok(page.session.avatarPreview);

  // Autosave spends its one silent retry before the failure is the author's
  // problem; the upload waits that out rather than reporting early.
  page.finish(new Error("network"));
  await settle();
  assert.equal(page.status("large")?.state, "saving", "still trying");

  t.mock.timers.tick(RETRY);
  await settle();
  page.finish(new Error("network"));
  await settle();

  assert.equal(page.status("large")?.state, "error");
  assert.equal(page.status("large")?.message, "Upload failed");
  assert.equal(page.session.avatarPreview, null, "the artwork is the creature's again");
  assert.deepEqual(page.cleared, [], "the file stays in the input for the next save to carry");

  t.mock.timers.tick(7000);
  assert.equal(page.status("large"), undefined, "and the message clears itself");
});

test("a file D&D Beyond wouldn't take is refused here, and never posted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = harness("WEBP images aren't accepted");

  page.pick("small", new File(["x"], "icon.webp", { type: "image/webp" }));
  await settle();

  assert.equal(page.saves, 0);
  assert.equal(page.status("small")?.state, "error");
  assert.equal(page.status("small")?.message, "WEBP images aren't accepted");
  assert.deepEqual(page.cleared, ["small"], "taken out of the input so no save carries it");
  assert.equal(page.session.avatarPreview, null, "and the artwork never changed");
});

test("the small avatar reports itself without touching the artwork", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = harness();

  page.pick("small");
  await settle();
  assert.equal(page.session.avatarPreview, null, "the block doesn't show the small avatar");
  assert.equal(page.status("small")?.state, "saving");

  page.finish();
  await settle();
  assert.equal(page.status("small")?.state, "success");
  assert.ok(page.status("small")?.thumbUrl, "the toast has the picture to show");
});

test("choose() opens the page's own file picker", () => {
  const page = harness();

  page.uploads.choose("large");
  page.uploads.choose("small");

  assert.deepEqual(page.picked, ["large", "small"]);
});

test("destroy() stops listening", async () => {
  const page = harness();
  page.uploads.destroy();

  page.pick("large");
  await settle();

  assert.equal(page.saves, 0);
});
