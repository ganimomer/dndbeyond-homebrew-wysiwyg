/**
 * A placeholder for a field that has become a component.
 *
 * The stat block is still drawn by hand, so a converted field can't simply be
 * a child in the tree — it has to be a hole the render loop fills. The
 * renderers emit one of these where the field goes, and the controller swaps in
 * the field's own element (see `StatBlockController.mountIslands`).
 *
 * Transitional. When the layouts themselves become components these disappear:
 * the fields go back to being ordinary children.
 */
export type IslandName = "gear" | "languages" | "skills";

export function island(name: IslandName): HTMLElement {
  const slot = document.createElement("span");
  slot.dataset.island = name;
  return slot;
}
