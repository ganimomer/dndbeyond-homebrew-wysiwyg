/**
 * A description section's body, in whichever of its three forms applies: the
 * list of entries most sections are, the single block of prose the Description
 * is, or the read-only fragment a sample creature's structured entries make.
 *
 * Shared by both layouts and by the Description below the frame, so the three of
 * them differ only in the heading they put above it.
 */
import type { JSX } from "preact";
import type { SectionKey } from "../../statblock/model.js";
import { sectionFocusKey } from "../AddSectionButton.js";
import { useSession } from "../store-context.js";
import { Raw } from "../shared/Raw.js";
import { ProseSection } from "./ProseSection.js";
import { SectionList } from "./SectionList.js";
import { LIST_SECTIONS, SECTION_PLACEHOLDER } from "./section-registry.js";
import type { SectionState } from "./section-state.js";

export function SectionBody({
  section,
  state,
  readOnly,
}: {
  section: SectionKey;
  state: SectionState;
  /**
   * How this layout wraps a read-only body. The editable form is the same
   * everywhere, but the fragment the samples produce is mounted differently by
   * each — `display:contents` in the 2014 block, a `.content` div in the 2024
   * one — and that is the layout's business, not this component's.
   */
  readOnly?: JSX.HTMLAttributes<HTMLDivElement>;
}) {
  const session = useSession();

  if (!state.editable && !state.revealed) {
    return <Raw node={state.body} data-section={section} {...readOnly} />;
  }

  // Set by the "Add section" menu: adding a section is always a prelude to
  // writing in it, so the caret goes to its first entry.
  const autoFocus = session.pendingFocus === sectionFocusKey(section);
  const placeholder = SECTION_PLACEHOLDER[section];

  return LIST_SECTIONS.has(section) ? (
    <SectionList
      section={section}
      html={state.html}
      autoFocus={autoFocus}
      placeholder={placeholder}
    />
  ) : (
    <ProseSection
      section={section}
      html={state.html}
      autoFocus={autoFocus}
      placeholder={placeholder}
    />
  );
}
