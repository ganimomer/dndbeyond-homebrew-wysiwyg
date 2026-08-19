/**
 * Builds the stat-block meta line ("Medium humanoid (elf), lawful evil") as DOM,
 * shared by both renderers. Size and alignment are plain text; the creature type
 * is an editable `<select>` dropdown, and the subtype is an editable multi-tag
 * editor (removable chips + a searchable "add" box) because DDB's sub-type is a
 * multi-select. Both are filled + committed by the panel's `wireMetaControls`.
 */
import type { Monster } from "../statblock/model.js";
import { el, metaSelect } from "./dom.js";
import { chip } from "./tags.js";

/** id of the shared subtype `<datalist>` (filled by wireMetaControls). */
export const SUBTYPE_LIST_ID = "meta-subtype-list";

function addInput(placeholder: string): HTMLInputElement {
  const input = el("input", "meta-add");
  input.type = "text";
  input.setAttribute("list", SUBTYPE_LIST_ID);
  input.setAttribute("aria-label", "Add subtype");
  input.placeholder = placeholder;
  // Fallback width for browsers without CSS field-sizing (Chrome uses that);
  // +2 leaves slack so proportional placeholder text isn't cropped.
  input.size = placeholder.length + 2;
  return input;
}

/** The multi-tag subtype editor: chips for each subtype + a searchable add box. */
function subTypeEditor(subTypes: string[]): HTMLElement {
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

export function metaContent(monster: Monster): Node[] {
  const nodes: Node[] = [];
  const text = (s: string) => document.createTextNode(s);

  if (monster.size) nodes.push(text(`${monster.size} `));
  nodes.push(metaSelect("type", monster.type || "—"));
  nodes.push(subTypeEditor(monster.subTypes));
  if (monster.alignment) nodes.push(text(`, ${monster.alignment}`));
  return nodes;
}
