/**
 * The stat-block name row, shared by both renderers: the creature's name and
 * the slot the overlay hangs its menu and save indicator in.
 *
 * The name itself is a component (see ui/fields/NameField.tsx) — it is a
 * `contenteditable`, and its content has to be managed by hand rather than
 * rendered, so it can't be markup emitted here.
 */
import type { Monster } from "../statblock/model.js";
import { el } from "./dom.js";
import { island } from "./island.js";

export function nameRow(_monster: Monster): HTMLElement {
  const row = el("div", "name-row");
  row.append(island("name"), el("div", "name-menu")); // menu filled by the overlay
  return row;
}
