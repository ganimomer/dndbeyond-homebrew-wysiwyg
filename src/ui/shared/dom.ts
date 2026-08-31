/** Tiny element builder shared by the stat-block renderers. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * A placeholder the editor fills with an autosave spinner (or a retry button)
 * for `origin`. Empty and zero-width while idle, so it costs nothing visually
 * until something is actually saving. Same contract as `data-mod`/`data-dep`:
 * the renderers mark the spot, the editor supplies the behavior.
 */
export function saveSlot(origin: string): HTMLElement {
  const slot = el("span", "save-slot");
  slot.dataset.saveOrigin = origin;
  return slot;
}
