/**
 * Turns the meta line's editable controls (emitted by `metaContent`) into live
 * editors that write straight back to the form, mirroring `wireAbilityInputs`:
 *
 *   - the size, type and alignment `<select>`s — fill options, preselect the
 *     current one, commit on change;
 *   - the subtype multi-tag editor — fill the search `<datalist>`, remove a tag on
 *     its ✕, add a tag when one is typed/picked; each edit writes the whole new
 *     set back (DDB's sub-type is a multi-select).
 *
 * Re-reading options every render keeps things correct after a write-back re-render.
 */
import type { SelectOption } from "../adapter/types.js";
import type { MetaKind } from "../preview/dom.js";

/** The adapter surface the meta controls need (satisfied by PageAdapter). */
export interface MetaControlsAdapter {
  sizeOptions(): SelectOption[];
  typeOptions(): SelectOption[];
  subTypeOptions(): SelectOption[];
  alignmentOptions(): SelectOption[];
  setSize(value: string): void;
  setType(value: string): void;
  setSubTypes(values: string[]): void;
  setAlignment(value: string): void;
}

export function wireMetaControls(scope: ParentNode, adapter: MetaControlsAdapter): void {
  wireSelect(scope, "size", () => adapter.sizeOptions(), (v) => adapter.setSize(v));
  wireSelect(scope, "type", () => adapter.typeOptions(), (v) => adapter.setType(v));
  wireSelect(
    scope,
    "alignment",
    () => adapter.alignmentOptions(),
    (v) => adapter.setAlignment(v),
  );
  wireSubTypes(scope, adapter);
}

/** Fills one single-value meta dropdown and commits the picked option's value. */
function wireSelect(
  scope: ParentNode,
  kind: MetaKind,
  options: () => SelectOption[],
  commit: (value: string) => void,
): void {
  const select = scope.querySelector<HTMLSelectElement>(
    `select.meta-select[data-meta="${kind}"]`,
  );
  if (!select) return;

  // DDB labels its "nothing chosen" option with a bare em-dash. Where the field
  // is blank the renderer seeded a prompt ("Alignment…") instead, so keep that
  // wording on the empty option rather than letting the dash win.
  const prompt = select.classList.contains("is-placeholder")
    ? (select.options[0]?.text ?? "")
    : "";

  // Replace the seeded option with the full list, keeping the customizable
  // <button><selectedcontent> trigger (only <option>s are removed).
  select.querySelectorAll("option").forEach((o) => o.remove());
  for (const o of options()) {
    const option = document.createElement("option");
    option.value = o.value;
    option.textContent = prompt && o.value === "" ? prompt : o.text;
    if (o.selected) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => commit(select.value));
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
  wrap.querySelectorAll<HTMLButtonElement>(".sb-chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.closest<HTMLElement>(".sb-chip");
      const value = labelToValue.get(tag?.dataset.value ?? "");
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
