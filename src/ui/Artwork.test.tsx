/**
 * The artwork as an upload surface: what the menu offers, what the block shows
 * before D&D Beyond has it, and what an upload says while it's happening.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { emptyMonster, type Monster } from "../statblock/model.js";
import type { AvatarSize } from "../adapter/types.js";
import { EditorStore } from "../state/store.js";
import { StoreContext } from "./store-context.js";
import { AvatarToast } from "./AvatarToast.js";
import { fireEvent, renderInShadowRoot } from "../test-support/render.js";
import { renderBlock, stubAdapter } from "../test-support/editor.js";

const creature = (overrides: Partial<Monster> = {}): Monster => ({
  ...emptyMonster(),
  name: "Dread Vampire",
  type: "Undead",
  ...overrides,
});

const trigger = (root: ShadowRoot) => root.querySelector<HTMLElement>(".sb-image .cm-trigger");
const artwork = (root: ShadowRoot) => root.querySelector<HTMLImageElement>(".sb-image img");
const items = (root: ShadowRoot) =>
  [...root.querySelectorAll<HTMLElement>(".sb-image .cm-item")].map((li) => li.textContent ?? "");

/** Opens the artwork's menu and clicks the item whose label starts with `label`. */
function chooseFromMenu(root: ShadowRoot, label: string) {
  fireEvent.click(trigger(root)!);
  const item = [...root.querySelectorAll<HTMLElement>(".sb-image .cm-item")].find((li) =>
    (li.textContent ?? "").startsWith(label),
  );
  assert.ok(item, `menu offers "${label}"`);
  fireEvent.click(item!);
}

test("the menu offers both uploads, over the type's stock picture too", (t) => {
  const { root } = renderBlock(t, creature());

  // No avatar of its own: this is the creature whose author most wants one.
  assert.ok(root.querySelector(".sb-image.is-default"));
  assert.ok(trigger(root), "the artwork carries a menu");
  fireEvent.click(trigger(root)!);
  assert.deepEqual(items(root), ["Upload small avatar…", "Upload large avatar…"]);
});

test("an upload opens the page's own file picker for that avatar", (t) => {
  const picked: AvatarSize[] = [];
  const { root } = renderBlock(t, creature(), {
    adapter: {
      chooseAvatar: (size) => {
        picked.push(size);
        return true;
      },
    },
  });

  chooseFromMenu(root, "Upload large avatar");
  chooseFromMenu(root, "Upload small avatar");

  assert.deepEqual(picked, ["large", "small"]);
});

test("a file chosen this session outranks the form's own preview", (t) => {
  const { root, store, repaint } = renderBlock(t, creature({ image: "https://ddb/old.jpg" }));
  assert.equal(artwork(root)?.src, "https://ddb/old.jpg");

  store.update({ avatarPreview: "blob:new" });
  repaint();

  assert.equal(artwork(root)?.src, "blob:new");
  assert.equal(root.querySelector(".sb-image.is-default"), null);
});

test("while an upload is saving the dim holds and the menu gives way to a spinner", (t) => {
  const { root, store, repaint } = renderBlock(t, creature());

  store.update({
    avatarStatus: new Map([["large", { state: "saving", thumbUrl: "blob:new" }]]),
  });
  repaint();

  assert.ok(root.querySelector(".sb-image.is-busy"), "the overlay stays up without a pointer");
  assert.ok(root.querySelector(".sb-image-state .save-spinner"));
  assert.equal(trigger(root), null, "and no second upload can be started over it");
});

test("the large avatar reports its outcome on the artwork", (t) => {
  const { root, store, repaint } = renderBlock(t, creature());

  store.update({
    avatarStatus: new Map([["large", { state: "success", thumbUrl: "blob:new" }]]),
  });
  repaint();
  assert.ok(root.querySelector(".sb-image-state.is-success"), "a tick, for a moment");

  store.update({
    avatarStatus: new Map([
      ["large", { state: "error", thumbUrl: "blob:new", message: "Upload failed" }],
    ]),
  });
  repaint();
  assert.equal(root.querySelector(".sb-image-state.is-error")?.textContent, "Upload failed");
});

test("the small avatar's outcome never lands on the artwork", (t) => {
  const { root, store, repaint } = renderBlock(t, creature());

  store.update({
    avatarStatus: new Map([["small", { state: "success", thumbUrl: "blob:icon" }]]),
  });
  repaint();

  assert.equal(root.querySelector(".sb-image-state"), null);
  assert.ok(trigger(root), "the artwork is the author's again");
});

/** The toast, which lives at the overlay's corner rather than in the block. */
function renderToast(t: TestContext, patch: Partial<Parameters<EditorStore["update"]>[0]>) {
  const store = new EditorStore(stubAdapter(creature()));
  store.start();
  t.after(() => store.stop());
  store.update(patch);
  return renderInShadowRoot(
    t,
    <StoreContext.Provider value={store}>
      <AvatarToast />
    </StoreContext.Provider>,
  );
}

test("the small avatar's toast shows the icon that was uploaded", (t) => {
  const { root } = renderToast(t, {
    avatarStatus: new Map([["small", { state: "success", thumbUrl: "blob:icon" }]]),
  });

  const toast = root.querySelector(".avatar-toast");
  assert.ok(toast?.classList.contains("is-success"));
  assert.equal(root.querySelector<HTMLImageElement>(".avatar-toast-thumb")?.src, "blob:icon");
  assert.match(toast!.textContent ?? "", /Small avatar\s*uploaded/);
});

test("a failed small upload says what went wrong, in error dress", (t) => {
  const { root } = renderToast(t, {
    avatarStatus: new Map([
      ["small", { state: "error", thumbUrl: "blob:icon", message: "Image is over 160 MB" }],
    ]),
  });

  const toast = root.querySelector(".avatar-toast");
  assert.ok(toast?.classList.contains("is-error"));
  assert.match(toast!.textContent ?? "", /Image is over 160 MB/);
});

test("nothing is shown while the small upload is still saving, or when it's done being reported", (t) => {
  const saving = renderToast(t, {
    avatarStatus: new Map([["small", { state: "saving", thumbUrl: "blob:icon" }]]),
  });
  assert.equal(saving.root.querySelector(".avatar-toast"), null);

  const quiet = renderToast(t, { avatarStatus: new Map() });
  assert.equal(quiet.root.querySelector(".avatar-toast"), null);
});
