/**
 * The one place the editor's state lives: the creature as D&D Beyond's form
 * currently has it, plus the session state that only the editor knows about.
 *
 * The form stays the source of truth for the creature — that is what keeps DDB's
 * own inputs and ours in agreement, and it is deliberate. The store's job is to
 * be the single point that re-reads it, the single point that holds session
 * state, and the single thing a view can subscribe to.
 *
 * Subscribers are told *what* changed, because the two kinds want different
 * timing:
 *
 *   - `"monster"` — the form mutated. Bursts of these arrive together (one edit
 *     can touch four fields), so a view should coalesce them into one paint.
 *   - `"session"` — the user opened a form, revealed a row, took a hint. These
 *     must be applied synchronously: a mini-form's click-away relies on the
 *     re-render happening inside the click that triggered it, before the capture
 *     phase has moved on.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Monster } from "../statblock/model.js";
// The registry of which rows are optional. It moves under `ui/` when the fields
// become components; the store only needs it to prune stale reveals.
import { basicsFields } from "../preview/optional-fields.js";
import { unarmoredAc } from "../statblock/armor-class.js";
import { emptySession, type SessionState } from "./session.js";

export type Change = "monster" | "session";

export type Listener = (change: Change) => void;

export class EditorStore {
  private monster: Monster | null = null;
  private session: SessionState = emptySession();
  private listeners = new Set<Listener>();
  private unobserve: (() => void) | null = null;

  constructor(readonly adapter: PageAdapter) {}

  /** Reads the form and starts watching it. */
  start(): void {
    this.refresh();
    this.unobserve = this.adapter.observe(() => this.refresh());
  }

  stop(): void {
    this.unobserve?.();
    this.unobserve = null;
    this.listeners.clear();
  }

  getMonster(): Monster | null {
    return this.monster;
  }

  getSession(): SessionState {
    return this.session;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Re-reads the creature from the form. Pruning happens here rather than at
   * render time so that it rides the same notification: a field that has just
   * been given a value renders on its own merit from now on, and its reveal
   * stops mattering.
   */
  refresh(): void {
    const monster = this.adapter.read();
    if (!monster) return;
    const first = this.monster === null;
    this.monster = monster;

    // What the armor is worth over the unarmored class, taken from the form as
    // we first found it. Seeded here rather than at render time because it
    // describes the *pristine* creature: by the time anything has been edited,
    // the figure to preserve is no longer derivable.
    if (first && this.session.armorBonus === null) {
      this.session = {
        ...this.session,
        armorBonus: monster.armorClass.value - unarmoredAc(monster),
      };
    }

    let revealed = this.session.revealed;
    for (const spec of basicsFields(monster.ruleset)) {
      if (spec.hasValue(monster) && revealed.has(spec.key)) {
        if (revealed === this.session.revealed) revealed = new Set(revealed);
        (revealed as Set<typeof spec.key>).delete(spec.key);
      }
    }
    if (revealed !== this.session.revealed) this.session = { ...this.session, revealed };

    this.emit("monster");
  }

  /**
   * Merges a patch into the session state and notifies synchronously. Callers
   * pass whole values (`revealed: reveal(session, key)`), so what a subscriber
   * reads back is always a complete, consistent session.
   */
  update(patch: Partial<SessionState>): void {
    this.session = { ...this.session, ...patch };
    this.emit("session");
  }

  /**
   * Takes the queued focus key, clearing it. It is a one-shot — the next render
   * consumes it — so reading it is what spends it.
   */
  takePendingFocus(): string | null {
    const pending = this.session.pendingFocus;
    if (pending !== null) this.session = { ...this.session, pendingFocus: null };
    return pending;
  }

  private emit(change: Change): void {
    for (const listener of this.listeners) listener(change);
  }
}
