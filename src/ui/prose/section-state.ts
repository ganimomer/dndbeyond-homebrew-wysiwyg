/**
 * Whether a description section belongs on the block, and in what form.
 *
 * The two layouts and the Description below the frame each used to work this out
 * for themselves — three copies of the same four lines, which was survivable
 * while the answer was "one editor or one fragment" and stopped being so once
 * the editable form grew into a list of entries.
 *
 * What it deliberately doesn't decide is the *heading*: the 2024 block prints
 * small caps, the 2014 block prints an h4, and the 2014 Traits section prints
 * nothing at all. That belongs to each layout.
 */
import type { Monster, NamedEntry, SectionKey } from "../../statblock/model.js";
import type { SessionState } from "../../state/session.js";
import { htmlHasContent, sectionBody } from "./sections.js";

export interface SectionState {
  /** Whether to print the section at all — heading included. */
  readonly visible: boolean;
  /** D&D Beyond holds prose for it, so it can be written to. */
  readonly editable: boolean;
  /** The author asked for it from the "Add section" button. */
  readonly revealed: boolean;
  /** This section's HTML, or "" for one that was only just revealed. */
  readonly html: string;
  /** The read-only body a sample creature's structured entries make. */
  readonly body: DocumentFragment | null;
}

export function sectionState(
  monster: Monster,
  section: SectionKey,
  session: SessionState,
  entries?: NamedEntry[],
  intro?: string,
): SectionState {
  const html = monster.descriptionHtml?.[section];
  const editable = htmlHasContent(html);
  // A section the creature has no text for isn't printed — unless the author
  // asked for it from the "Add section" button, which holds an empty editor open
  // to write in.
  const revealed = session.revealedSections.has(section);
  const body = editable ? null : sectionBody(monster, section, entries, intro);
  return { visible: editable || revealed || !!body, editable, revealed, html: html ?? "", body };
}
