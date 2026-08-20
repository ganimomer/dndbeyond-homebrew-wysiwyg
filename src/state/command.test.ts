import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageAdapter } from "../adapter/types.js";
import { CommandStack, type Command } from "./command.js";

/** Records what was done to it, in order. */
function stubAdapter() {
  const log: string[] = [];
  return { adapter: { log } as unknown as PageAdapter, log };
}

function stackWith() {
  const { adapter, log } = stubAdapter();
  const saved: string[] = [];
  return { stack: new CommandStack(adapter, (origin) => saved.push(origin)), log, saved };
}

/** A field-ish command that appends to the adapter's log. */
const noted = (name: string, extra: Partial<Command> = {}): Command => ({
  label: name,
  origin: "header",
  persist: "autosave",
  apply: (a) => void (a as unknown as { log: string[] }).log.push(`do:${name}`),
  revert: (a) => void (a as unknown as { log: string[] }).log.push(`undo:${name}`),
  ...extra,
});

test("applies a command and can put it back", async () => {
  const { stack, log } = stackWith();

  await stack.run(noted("a"));
  assert.deepEqual(log, ["do:a"]);
  assert.equal(stack.canUndo, true);
  assert.equal(stack.undoLabel, "a");

  await stack.undo();
  assert.deepEqual(log, ["do:a", "undo:a"]);
  assert.equal(stack.canUndo, false);
  assert.equal(stack.canRedo, true);

  await stack.redo();
  assert.deepEqual(log, ["do:a", "undo:a", "do:a"]);
});

test("a synchronous command has landed before run() returns", () => {
  const { stack, log } = stackWith();

  // Not awaited: the write must already have happened, because the form
  // mutation and the re-render it causes have to stay inside the click.
  void stack.run(noted("a"));

  assert.deepEqual(log, ["do:a"]);
});

test("consecutive edits to the same thing are one step back", async () => {
  const { stack, log } = stackWith();

  await stack.run(noted("first", { mergeKey: "traits" }));
  await stack.run(noted("second", { mergeKey: "traits" }));
  await stack.run(noted("third", { mergeKey: "traits" }));

  assert.equal(stack.undoLabel, "third", "the label is the latest edit");

  log.length = 0;
  await stack.undo();

  // One undo, and it goes back to before the burst rather than one keystroke
  // into it.
  assert.deepEqual(log, ["undo:first"]);
  assert.equal(stack.canUndo, false);
});

test("edits to different things stay separate", async () => {
  const { stack } = stackWith();

  await stack.run(noted("a", { mergeKey: "traits" }));
  await stack.run(noted("b", { mergeKey: "actions" }));

  await stack.undo();
  assert.equal(stack.undoLabel, "a");
});

test("a fresh edit makes what was undone unreachable", async () => {
  const { stack } = stackWith();
  await stack.run(noted("a"));
  await stack.undo();
  assert.equal(stack.canRedo, true);

  await stack.run(noted("b"));

  assert.equal(stack.canRedo, false);
});

test("only the form-field edits ask autosave for anything", async () => {
  const { stack, saved } = stackWith();

  await stack.run(noted("field", { origin: "traits" }));
  await stack.run(noted("record", { persist: "self" }));

  assert.deepEqual(saved, ["traits"]);
});

test("a batch applies in order, undoes in reverse, and counts once", async () => {
  const { stack, log } = stackWith();

  await stack.transaction([noted("a"), noted("b"), noted("c")], "Apply template");

  assert.deepEqual(log, ["do:a", "do:b", "do:c"]);
  assert.equal(stack.undoLabel, "Apply template");

  log.length = 0;
  await stack.undo();

  assert.deepEqual(log, ["undo:c", "undo:b", "undo:a"]);
  assert.equal(stack.canUndo, false, "the whole batch was one step");
});

test("a command that fails leaves nothing to undo", async () => {
  const { stack } = stackWith();

  await assert.rejects(
    stack.run({
      ...noted("doomed"),
      apply: () => Promise.reject(new Error("D&D Beyond said no")),
    }),
  );

  assert.equal(stack.canUndo, false);
});
