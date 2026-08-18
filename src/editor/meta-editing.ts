/**
 * Turns the meta line's editable controls (emitted by `metaContent`) into live
 * editors that write straight back to the form, mirroring `wireAbilityInputs`:
 *
 *   - the type `<select>` — fill options, preselect the current one, commit on change;
 *   - the subtype multi-tag editor — fill the search `<datalist>`, remove a tag on
 *     its ✕, add a tag when one is typed/picked; each edit writes the whole new
 *     set back (DDB's sub-type is a multi-select).
 *
 * Re-reading options every render keeps things correct after a write-back re-render.
 */
import type { SelectOption } from "../adapter/types.js";

/** The adapter surface the meta controls need (satisfied by PageAdapter). */
export interface MetaControlsAdapter {
  typeOptions(): SelectOption[];
  subTypeOptions(): SelectOption[];
  setType(value: string): void;
  setSubTypes(values: string[]): void;
}

export function wireMetaControls(scope: ParentNode, adapter: MetaControlsAdapter): void {
  wireTypeSelect(scope, adapter);
  wireSubTypes(scope, adapter);
}

function wireTypeSelect(scope: ParentNode, adapter: MetaControlsAdapter): void {
  const select = scope.querySelector<HTMLSelectElement>('select.meta-select[data-meta="type"]');
  if (!select) return;

  // Replace the seeded option with the full list, keeping the customizable
  // <button><selectedcontent> trigger (only <option>s are removed).
  select.querySelectorAll("option").forEach((o) => o.remove());
  for (const o of adapter.typeOptions()) {
    const option = document.createElement("option");
    option.value = o.value;
    option.textContent = o.text;
    if (o.selected) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => adapter.setType(select.value));
}

function wireSubTypes(scope: ParentNode, adapter: MetaControlsAdapter): void {
  const wrap = scope.querySelector<HTMLElement>('.meta-subtypes[data-meta="subTypes"]');
  if (!wrap) return;

  const options = adapter.subTypeOptions();
  const labelToValue = new Map(options.map((o) => [o.text, o.value]));
  const current = options.filter((o) => o.selected).map((o) => o.value);

  // Fill the search datalist with every tag label.
  const datalist = wrap.querySelector<HTMLDataListElement>("datalist");
  if (datalist) {
    datalist.replaceChildren();
    for (const o of options) {
      const option = document.createElement("option");
      option.value = o.text;
      datalist.appendChild(option);
    }
  }

  // Removing a chip commits the set without that tag's value.
  wrap.querySelectorAll<HTMLButtonElement>(".meta-tag-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.closest<HTMLElement>(".meta-tag");
      const value = labelToValue.get(tag?.dataset.subtype ?? "");
      if (value === undefined) return;
      adapter.setSubTypes(current.filter((v) => v !== value));
    });
  });

  // Typing/picking a known tag commits the set with it added; anything else clears.
  const input = wrap.querySelector<HTMLInputElement>(".meta-add");
  if (input) {
    input.addEventListener("change", () => {
      const value = labelToValue.get(input.value.trim());
      if (value !== undefined && !current.includes(value)) {
        adapter.setSubTypes([...current, value]);
      } else {
        input.value = "";
      }
    });
  }
}
