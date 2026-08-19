/**
 * The "Add…" menu at the foot of the basics section: every field the creature
 * hasn't got, one click from being on the block.
 *
 * Revealing is *only* a view decision — nothing is written to D&D Beyond, and
 * the panel forgets it as soon as the field has a real value to render from
 * (see `EditorPanel.pruneRevealed`). Which is also what makes a field go away
 * again when its last value is removed.
 */
import type { FieldSpec, OptionalField } from "../preview/optional-fields.js";
import { ContextMenu } from "./context-menu.js";

/**
 * The control to put the caret in when `key` is revealed, or null when the
 * field's first move is a menu rather than typing.
 */
export function revealFocusKey(key: OptionalField): string | null {
  return key === "gear" || key === "languages" ? `text:${key}` : null;
}

export function wireAddField(
  scope: ParentNode,
  hidden: FieldSpec[],
  onReveal: (key: OptionalField) => void,
): ContextMenu[] {
  const host = scope.querySelector<HTMLElement>(".add-field");
  // The renderer only emits the footer when something is missing, so an absent
  // host means there's nothing left to offer.
  if (!host || !hidden.length) return [];

  const menu = new ContextMenu(
    hidden.map((spec) => ({ label: spec.menuLabel, onClick: () => onReveal(spec.key) })),
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
