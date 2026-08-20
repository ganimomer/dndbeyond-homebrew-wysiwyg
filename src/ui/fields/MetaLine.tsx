/**
 * The stat block's meta line: "Medium humanoid (elf), lawful evil".
 *
 * Size, creature type and alignment are each a filterable picker over D&D
 * Beyond's own options; the subtype is a multi-tag editor, because DDB's
 * sub-type is a multi-select. All four are optional (see optional-fields.ts),
 * and the line is assembled from whichever are showing — so a creature with no
 * alignment prints "Medium humanoid" rather than a dangling comma.
 *
 * One component rather than four, because the separators belong to the sentence
 * and not to any slot in it: size and type are spaced, the subtype's
 * parenthetical hugs the type it qualifies, and the alignment's comma only
 * appears when something precedes it.
 */
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { SelectOption } from "../../adapter/types.js";
import type { Monster } from "../../statblock/model.js";
import type { OptionalField } from "./registry.js";
import { Chip } from "../shared/Chip.js";
import { OptionPicker } from "../shared/OptionPicker.js";

/** Which meta-line control a picker drives. */
export type MetaKind = "size" | "type" | "subType" | "alignment";

const META_LABEL: Record<MetaKind, string> = {
  size: "Size",
  type: "Creature type",
  subType: "Creature subtype",
  alignment: "Alignment",
};

/** id of the shared subtype `<datalist>`. */
export const SUBTYPE_LIST_ID = "meta-subtype-list";

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

interface SlotProps {
  kind: MetaKind;
  /** The creature's current value, or "" when it has none. */
  value: string;
  /** Shown dimmed in place of a value: "Alignment…". */
  prompt: string;
  options: SelectOption[];
  commit: (value: string) => void;
  autoOpen: boolean;
}

/**
 * One meta-line slot. A value rides in a chip like every other value on the
 * block, so its ✕ takes the field off the stat block; with nothing chosen there
 * is nothing to remove, so it renders as dimmed prompt text instead.
 */
function MetaSlot({ kind, value, prompt, options, commit, autoOpen }: SlotProps) {
  const [open, setOpen] = useState(autoOpen);
  const label = META_LABEL[kind];
  const isPlaceholder = !value;

  const picker = (
    <OptionPicker
      options={options.map((option) => ({
        // DDB labels its "nothing chosen" option with a bare em-dash. Where the
        // field is blank we show a prompt instead, so keep that wording on the
        // empty option rather than letting the dash win.
        label: isPlaceholder && option.value === "" ? prompt : option.text,
        selected: option.selected,
        onClick: () => commit(option.value),
      }))}
      trigger={{
        text: value || prompt,
        ariaLabel: label,
        variant: "value",
        // The dimming lives on the trigger, not the slot: `opacity` takes a
        // whole subtree with it, and the picker's popover hangs inside the slot.
        isPlaceholder,
      }}
      filterPlaceholder={`Filter ${label.toLowerCase()}…`}
      focusKey={`meta:${kind}`}
      open={open}
      onOpenChange={setOpen}
    />
  );

  const slot = (
    <span class="meta-slot" data-meta={kind} data-label={label}>
      {picker}
    </span>
  );

  if (isPlaceholder) return slot;

  // A ✕ commits DDB's own "nothing chosen" option — the same thing picking its
  // em-dash does. A field DDB gives no such option simply can't be emptied, so
  // it loses the ✕ rather than being handed an invalid value.
  const clearable = options.some((option) => option.value === "");
  return (
    <Chip
      value={value}
      label={slot}
      removeLabel={label.toLowerCase()}
      onRemove={clearable ? () => commit("") : undefined}
      hideRemove={!clearable}
    />
  );
}

/** The multi-tag subtype editor: a chip per subtype and a searchable add box. */
function SubTypeEditor({
  subTypes,
  options,
  commit,
}: {
  subTypes: string[];
  options: SelectOption[];
  commit: (values: string[]) => void;
}) {
  const labelToValue = new Map(options.map((o) => [o.text, o.value]));
  const current = options.filter((o) => o.selected).map((o) => o.value);

  const addBox = (placeholder: string) => (
    <input
      class="meta-add"
      type="text"
      list={SUBTYPE_LIST_ID}
      aria-label="Add subtype"
      // Revealing the subtype slot puts the caret straight in here.
      data-focus-key="meta:subTypes"
      placeholder={placeholder}
      // Fallback width for browsers without CSS field-sizing (Chrome has it);
      // +2 leaves slack so proportional placeholder text isn't cropped.
      size={placeholder.length + 2}
      onChange={(event) => {
        const input = event.currentTarget as HTMLInputElement;
        const value = labelToValue.get(input.value.trim());
        // Anything we don't recognise clears the box rather than committing.
        if (value !== undefined && !current.includes(value)) commit([...current, value]);
        else input.value = "";
      }}
    />
  );

  return (
    <span class="meta-subtypes" data-meta="subTypes">
      <datalist id={SUBTYPE_LIST_ID}>
        {options.map((option) => (
          <option key={option.value} value={option.text} />
        ))}
      </datalist>
      {subTypes.length ? (
        <>
          {" ("}
          {subTypes.map((subType, index) => (
            <>
              {index ? ", " : null}
              <Chip
                key={subType}
                value={subType}
                label={subType}
                onRemove={() => {
                  const value = labelToValue.get(subType);
                  if (value !== undefined) commit(current.filter((v) => v !== value));
                }}
              />
            </>
          ))}
          {" "}
          {addBox("add…")}
          {")"}
        </>
      ) : (
        <>
          {" "}
          {addBox("Select subtype…")}
        </>
      )}
    </span>
  );
}

export interface MetaLineProps {
  monster: Monster;
  /** Which slots are showing (see `visibleMeta`). */
  shown: ReadonlySet<OptionalField>;
  adapter: MetaControlsAdapter;
  /** The control a just-revealed field wants the caret in. */
  pendingFocus?: string | null;
}

export function MetaLine({ monster, shown, adapter, pendingFocus }: MetaLineProps) {
  const slot = (
    kind: Exclude<MetaKind, "subType">,
    value: string,
    prompt: string,
    options: SelectOption[],
    commit: (value: string) => void,
  ) => (
    <MetaSlot
      kind={kind}
      value={value}
      prompt={prompt}
      options={options}
      commit={commit}
      autoOpen={pendingFocus === `meta:${kind}`}
    />
  );

  const groups: ComponentChildren[] = [];
  if (shown.has("size")) {
    groups.push(
      slot("size", monster.size, "Size…", adapter.sizeOptions(), (v) => adapter.setSize(v)),
    );
  }

  const typeGroup: ComponentChildren[] = [];
  if (shown.has("type")) {
    typeGroup.push(
      slot("type", monster.type, "Type…", adapter.typeOptions(), (v) => adapter.setType(v)),
    );
  }
  if (shown.has("subTypes")) {
    typeGroup.push(
      <SubTypeEditor
        subTypes={monster.subTypes}
        options={adapter.subTypeOptions()}
        commit={(values) => adapter.setSubTypes(values)}
      />,
    );
  }
  if (typeGroup.length) groups.push(<>{typeGroup}</>);

  return (
    <>
      {groups.map((group, index) => (
        <>
          {index ? " " : null}
          {group}
        </>
      ))}
      {shown.has("alignment") ? (
        <>
          {groups.length ? ", " : null}
          {slot(
            "alignment",
            monster.alignment,
            "Alignment…",
            adapter.alignmentOptions(),
            (v) => adapter.setAlignment(v),
          )}
        </>
      ) : null}
    </>
  );
}
