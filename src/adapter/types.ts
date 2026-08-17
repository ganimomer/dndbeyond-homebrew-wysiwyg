/**
 * The seam between our stat-block model and D&D Beyond's actual page.
 *
 * Everything above this interface is browser- and page-agnostic. Everything
 * below it knows about DDB's DOM. Swapping content types (spells, items) later
 * means adding another adapter, not touching the editor or preview.
 */
import type { Monster } from "../statblock/model.js";

export type HomebrewKind = "monster" | "item" | "spell" | "unknown";

export interface PageAdapter {
  /** Which homebrew content type this adapter understands. */
  readonly kind: HomebrewKind;

  /** True when this adapter applies to the currently-loaded page. */
  matches(): boolean;

  /**
   * Reads DDB's form into our model. Returns null when the form isn't present
   * yet (DDB renders asynchronously), so callers can retry.
   */
  read(): Monster | null;

  /** Writes our model back into DDB's form fields. */
  write(monster: Monster): void;

  /**
   * Watches DDB's own fields for user edits and invokes `onChange`. Returns an
   * unsubscribe function. Lets the preview stay in sync when the user types in
   * DDB's native inputs rather than ours.
   */
  observe(onChange: () => void): () => void;
}
