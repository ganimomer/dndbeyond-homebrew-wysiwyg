/**
 * A section edited as one block of prose — the Description, and nothing else.
 *
 * The list sections (traits, actions and the rest) are cut into their entries
 * and edited a row at a time; see `SectionList`. Description isn't a list: it's
 * where an author writes what the creature looks like and where it's found, in
 * whatever shape that takes. So it keeps the single editor the whole block used
 * to have.
 *
 * Sections a creature has no HTML for — the structured samples — stay read-only;
 * there is no D&D Beyond field behind them to write to.
 */
import type { SectionKey } from "../../statblock/model.js";
import { useEditing } from "../store-context.js";
import { ProseItem } from "./ProseItem.js";

export interface ProseSectionProps {
  section: SectionKey;
  html: string;
  /**
   * Put the caret here as soon as it mounts. Set by the "Add section" menu:
   * adding a section is always a prelude to writing in it.
   */
  autoFocus?: boolean;
  /** Shown while the section is empty, e.g. "What it looks like…". */
  placeholder?: string;
}

export function ProseSection({ section, html, autoFocus, placeholder }: ProseSectionProps) {
  const editing = useEditing();
  return (
    <div class="sb-section" data-section={section}>
      <ProseItem
        name={section}
        html={html}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onCommit={(edited) => editing.setDescription(section, edited)}
      />
    </div>
  );
}
