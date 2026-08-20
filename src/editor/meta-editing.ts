/**
 * Turns the meta line's editable controls (emitted by `metaContent`) into live
 * editors that write straight back to the form, mirroring `wireAbilityInputs`:
 *
 *   - the size, type and alignment slots — each becomes an `OptionPicker` over
 *     DDB's options, opening on the current one and committing the pick;
 *   - the subtype multi-tag editor — fill the search `<datalist>`, remove a tag on
 *     its ✕, add a tag when one is typed/picked; each edit writes the whole new
 *     set back (DDB's sub-type is a multi-select).
 *
 * Re-reading options every render keeps things correct after a write-back re-render.
 */
import type { SelectOption } from "../adapter/types.js";
import type { MetaKind } from "../preview/meta.js";
import { OptionPicker } from "./option-picker.js";

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

/** The pickers built for the meta line; the panel owns destroying them. */
export function wireMetaControls(
  scope: ParentNode,
  adapter: MetaControlsAdapter,
): OptionPicker[] {
  const pickers = [
    wirePicker(scope, "size", () => adapter.sizeOptions(), (v) => adapter.setSize(v)),
    wirePicker(scope, "type", () => adapter.typeOptions(), (v) => adapter.setType(v)),
    wirePicker(
      scope,
      "alignment",
      () => adapter.alignmentOptions(),
      (v) => adapter.setAlignment(v),
    ),
  ];
  wireSubTypes(scope, adapter);
  return pickers.filter((p): p is OptionPicker => p !== null);
}

/** Turns one meta slot into a picker over DDB's options for that field. */
function wirePicker(
  scope: ParentNode,
  kind: MetaKind,
  options: () => SelectOption[],
  commit: (value: string) => void,
): OptionPicker | null {
  const slot = scope.querySelector<HTMLElement>(`.meta-slot[data-meta="${kind}"]`);
  if (!slot) return null;

  // DDB labels its "nothing chosen" option with a bare em-dash. Where the field
  // is blank the renderer seeded a prompt ("Alignment…") instead, so keep that
  // wording on the empty option rather than letting the dash win.
  const isPlaceholder = slot.classList.contains("is-placeholder");
  const prompt = isPlaceholder ? slot.textContent ?? "" : "";
  const label = slot.dataset.label ?? kind;
  const choices = options();

  // A value's chip carries a ✕, which commits DDB's own "nothing chosen"
  // option — the same thing picking its em-dash does, and what takes the field
  // back off the block. A field DDB gives no such option simply can't be
  // emptied, so it loses the ✕ rather than being handed an invalid value.
  const remove = slot.closest(".sb-chip")?.querySelector<HTMLButtonElement>(".sb-chip-remove");
  if (remove) {
    if (choices.some((o) => o.value === "")) remove.addEventListener("click", () => commit(""));
    else remove.remove();
  }

  const picker = new OptionPicker(
    choices.map((o) => ({
      label: prompt && o.value === "" ? prompt : o.text,
      selected: o.selected,
      onClick: () => commit(o.value),
    })),
    {
      trigger: {
        text: slot.textContent ?? "",
        ariaLabel: label,
        variant: "value",
        isPlaceholder,
      },
      filterPlaceholder: `Filter ${label.toLowerCase()}…`,
      focusKey: `meta:${kind}`,
    },
  );
  slot.replaceChildren(picker.element);
  return picker;
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
