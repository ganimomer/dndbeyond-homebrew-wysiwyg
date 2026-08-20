/**
 * Every edit the user makes, as something that can be undone.
 *
 * Before this, an edit was a call to the adapter followed by a nudge to
 * autosave, written out by hand at each of the twenty-odd places one could
 * happen. That works exactly until you want to undo one, or apply fifty at once
 * from a template, or tell the user what they just did — none of which you can
 * build on a call site.
 *
 * A Command is that edit reified: what it is called, how to do it, and how to
 * put it back. Commands capture the value they are replacing when they are
 * built, which is what makes `revert` possible without snapshotting the whole
 * creature on every keystroke.
 *
 * Two kinds, and the difference is D&D Beyond's, not ours:
 *
 *   - `"autosave"` — the edit lands in a form field. Persisting is somebody
 *     else's job, on a debounce, so the command only says who to blame for the
 *     spinner.
 *   - `"self"` — the edit *is* a request. Skills, movements and senses are
 *     separate records with their own endpoints, so applying one is a network
 *     round-trip and so is undoing it.
 */
import type { PageAdapter } from "../adapter/types.js";

export interface Command {
  /** How the edit would be described in an undo affordance. */
  readonly label: string;
  /**
   * Which part of the stat block the edit came from — drives spinner placement.
   * A `SaveOrigin` (see editor/autosave.ts), kept as a bare string here so the
   * state layer doesn't reach into the editor for a type alias.
   */
  readonly origin: string;
  readonly persist: "autosave" | "self";
  /**
   * Consecutive commands sharing a key collapse into one undo step, keeping the
   * older one's `revert`. This is what stops a paragraph of typing from
   * becoming four hundred separate things to undo.
   */
  readonly mergeKey?: string;
  apply(adapter: PageAdapter): void | Promise<void>;
  revert(adapter: PageAdapter): void | Promise<void>;
}

/** How deep the undo history goes before the oldest edits fall off. */
const HISTORY_LIMIT = 200;

export class CommandStack {
  private done: Command[] = [];
  private undone: Command[] = [];

  constructor(
    private readonly adapter: PageAdapter,
    /** Told which origin has unsaved work, for the commands that ride autosave. */
    private readonly persist: (origin: string) => void,
  ) {}

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** What `undo()` would put back, for labelling the affordance. */
  get undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  /**
   * Applies a command and records it.
   *
   * A synchronous command is applied and recorded before this returns — the
   * write to D&D Beyond's form, the mutation it raises and the re-render that
   * follows all happen inside the call, which is what the open mini-forms rely
   * on. The promise is there for the listing records, whose apply is a request.
   * A command that throws is not recorded: nothing happened, so there is
   * nothing to undo.
   */
  run(command: Command): Promise<void> {
    const applied = command.apply(this.adapter);
    if (applied instanceof Promise) return applied.then(() => this.record(command));
    this.record(command);
    return Promise.resolve();
  }

  /**
   * Applies several commands as a single undoable step — what a template, a
   * bulk edit or a copied stat block is made of.
   *
   * Sequentially, because the listing records post a form each and D&D Beyond
   * answers with the whole page; overlapping those would have them clobber one
   * another's tables.
   */
  async transaction(commands: Command[], label: string): Promise<void> {
    const applied: Command[] = [];
    for (const command of commands) {
      await command.apply(this.adapter);
      applied.push(command);
    }
    if (applied.length === 0) return;
    this.record(batch(applied, label));
  }

  async undo(): Promise<void> {
    const command = this.done.pop();
    if (!command) return;
    await command.revert(this.adapter);
    this.undone.push(command);
    if (command.persist === "autosave") this.persist(command.origin);
  }

  async redo(): Promise<void> {
    const command = this.undone.pop();
    if (!command) return;
    await command.apply(this.adapter);
    this.done.push(command);
    if (command.persist === "autosave") this.persist(command.origin);
  }

  private record(command: Command): void {
    const previous = this.done.at(-1);
    if (previous && command.mergeKey && previous.mergeKey === command.mergeKey) {
      // Same field, still being edited: keep the new value but the old way back,
      // so undo returns to before the burst rather than one keystroke into it.
      this.done[this.done.length - 1] = { ...command, revert: previous.revert };
    } else {
      this.done.push(command);
      if (this.done.length > HISTORY_LIMIT) this.done.shift();
    }
    // Anything undone is unreachable once a new edit lands on top of it.
    this.undone = [];
    if (command.persist === "autosave") this.persist(command.origin);
  }
}

/** Several commands as one: applied in order, reverted in reverse. */
function batch(commands: Command[], label: string): Command {
  return {
    label,
    origin: commands[0]!.origin,
    // One of them touching a form field is enough to need a save.
    persist: commands.some((c) => c.persist === "autosave") ? "autosave" : "self",
    async apply(adapter) {
      for (const command of commands) await command.apply(adapter);
    },
    async revert(adapter) {
      for (const command of [...commands].reverse()) await command.revert(adapter);
    },
  };
}
