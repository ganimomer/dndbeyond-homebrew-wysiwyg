/**
 * Builds the stat-block meta line ("Medium humanoid (elf), lawful evil") as DOM,
 * shared by both renderers. Size, creature type and alignment are each a slot
 * the editor turns into a filterable picker; the subtype is an editable
 * multi-tag editor (removable chips + a searchable "add" box) because DDB's
 * sub-type is a multi-select. All four are filled + committed by the panel's
 * `wireMetaControls`.
 *
 * All four are also optional (see optional-fields.ts): the line is assembled
 * from whichever slots are showing, so a creature with no alignment prints
 * "Medium humanoid" rather than a dangling comma.
 */
import type { Monster } from "../statblock/model.js";
import type { OptionalField } from "./optional-fields.js";
import { el, metaSlot } from "./dom.js";
import { chip } from "./tags.js";

/** id of the shared subtype `<datalist>` (filled by wireMetaControls). */
export const SUBTYPE_LIST_ID = "meta-subtype-list";

function addInput(placeholder: string): HTMLInputElement {
  const input = el("input", "meta-add");
  input.type = "text";
  input.setAttribute("list", SUBTYPE_LIST_ID);
  input.setAttribute("aria-label", "Add subtype");
  // Revealing the subtype slot puts the caret straight in here.
  input.dataset.focusKey = "meta:subTypes";
  input.placeholder = placeholder;
  // Fallback width for browsers without CSS field-sizing (Chrome uses that);
  // +2 leaves slack so proportional placeholder text isn't cropped.
  input.size = placeholder.length + 2;
  return input;
}

/** The multi-tag subtype editor: chips for each subtype + a searchable add box. */
export function subTypeEditor(subTypes: string[]): HTMLElement {
  const wrap = el("span", "meta-subtypes");
  wrap.dataset.meta = "subTypes";

  const datalist = el("datalist");
  datalist.id = SUBTYPE_LIST_ID; // options filled by wireMetaControls
  wrap.append(datalist);

  if (subTypes.length) {
    wrap.append(document.createTextNode(" ("));
    subTypes.forEach((s, i) => {
      if (i) wrap.append(document.createTextNode(", "));
      // The subtype's own label is the token the editor resolves to an option value.
      wrap.append(chip({ value: s, label: s }));
    });
    wrap.append(document.createTextNode(" "), addInput("add…"), document.createTextNode(")"));
  } else {
    wrap.append(document.createTextNode(" "), addInput("Select subtype…"));
  }
  return wrap;
}

/**
 * The meta line's nodes, holding only the slots in `shown` (see `visibleMeta`).
 * A slot that's showing but empty renders dimmed prompt text, because it was
 * added deliberately and is waiting to be filled in.
 *
 * Separators follow the sentence rather than the slots: size and type are
 * spaced, the subtype's parenthetical hugs the type it qualifies, and the
 * alignment's comma only appears when something precedes it.
 */
export function metaContent(monster: Monster, shown: ReadonlySet<OptionalField>): Node[] {
  const text = (s: string) => document.createTextNode(s);

  const groups: Node[][] = [];
  if (shown.has("size")) {
    groups.push([metaSlot("size", monster.size || "Size…", !monster.size)]);
  }
  const typeGroup: Node[] = [];
  if (shown.has("type")) {
    typeGroup.push(metaSlot("type", monster.type || "Type…", !monster.type));
  }
  if (shown.has("subTypes")) typeGroup.push(subTypeEditor(monster.subTypes));
  if (typeGroup.length) groups.push(typeGroup);

  const nodes = groups.flatMap((group, i) => (i ? [text(" "), ...group] : group));

  if (shown.has("alignment")) {
    if (nodes.length) nodes.push(text(", "));
    nodes.push(metaSlot("alignment", monster.alignment || "Alignment…", !monster.alignment));
  }
  return nodes;
}
