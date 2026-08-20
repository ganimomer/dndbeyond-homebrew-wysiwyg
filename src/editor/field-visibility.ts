/**
 * The "Add…" menu at the foot of the basics section: every field the creature
 * hasn't got, one click from being on the block.
 *
 * Revealing is *only* a view decision — nothing is written to D&D Beyond, and
 * the panel forgets it as soon as the field has a real value to render from
 * (see `EditorPanel.pruneRevealed`). Which is also what makes a field go away
 * again when its last value is removed.
 */
import type { FieldSpec } from "../preview/optional-fields.js";
import { ContextMenu } from "./context-menu.js";

/**
 * `onReveal` is handed the whole spec rather than its key: the caller wants
 * `focusKey` too, to land the user in the control it just put on the block.
 */
export function wireAddField(
  scope: ParentNode,
  hidden: FieldSpec[],
  onReveal: (spec: FieldSpec) => void,
): ContextMenu[] {
  const host = scope.querySelector<HTMLElement>(".add-field");
  // The renderer only emits the footer when something is missing, so an absent
  // host means there's nothing left to offer.
  if (!host || !hidden.length) return [];

  const menu = new ContextMenu(
    hidden.map((spec) => ({ label: spec.menuLabel, onClick: () => onReveal(spec) })),
    {
      triggerText: "Add…",
      triggerIcon: "add",
      triggerLabel: "Add a field",
      triggerClass: "add-field-trigger",
      menuClass: "compact",
    },
  );
  host.replaceChildren(menu.element);
  return [menu];
}
