/**
 * Picking a reference to drop into the prose: what kind of thing, then which
 * one.
 *
 * Two stages, and the difference between them is where the caret is.
 *
 * **Choosing a kind** happens while the author is still typing the slash
 * command, so the caret must stay in the editor — the command is *in* the
 * prose, and taking focus away would strand it. The list is six rows and needs
 * no filter box of its own: what narrows it is the `/con` already on the page.
 * Its keyboard therefore arrives second-hand, through commands the editor takes
 * off Lexical and forwards (see `ProseEditor.setMenuOpen`), which is also why
 * the highlight lives in the owner rather than here.
 *
 * **Choosing an entity** happens after the command has been taken back out of
 * the prose. There is nothing left in the document to type into, and the
 * glossary runs to 127 rows, so this stage takes the caret into a filter box of
 * its own and handles its own keys. Where the reference will go is by then a
 * saved `InsertionPoint`, not a selection.
 *
 * The combobox behaviour is `shared/OptionPicker.tsx`'s, deliberately: rows
 * hidden rather than dropped so the list never reshuffles under the cursor, one
 * `is-active` highlight that the arrows and the pointer share,
 * `aria-activedescendant` for the row Enter means. Not *reused* from it,
 * because that component is built around a trigger button this has no use for
 * — a menu already summoned by a keystroke has nothing left to trigger.
 *
 * Positioned inside the entry rather than portalled, like everything else here:
 * it lives in a shadow root, so there is no document body to escape to.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  entitiesOf,
  type ReferenceEntity,
  type ReferenceKind,
} from "../../adapter/reference-catalog.js";
import { menuPlacement } from "./menu-placement.js";

/** Ids only have to be unique within the document; aria-activedescendant needs them. */
let nextId = 0;

export interface ReferenceMenuProps {
  /** What opened it, in viewport coordinates: the slash, or the "+" button. */
  anchor: DOMRect;
  /**
   * Null while the author is choosing a kind; the chosen kind once they have.
   */
  kind: ReferenceKind | null;
  /** The kinds on offer, already narrowed by whatever follows the slash. */
  kinds: readonly ReferenceKind[];
  /** Which kind row is highlighted. Owned above, because the keys arrive there. */
  active: number;
  onHighlight: (index: number) => void;
  onChooseKind: (kind: ReferenceKind) => void;
  onChoose: (entity: ReferenceEntity) => void;
  onDismiss: () => void;
}

export function ReferenceMenu(props: ReferenceMenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(null);

  // Measured, then placed: one forced layout per open, and the panel is never
  // drawn in the wrong place — it isn't drawn at all until it knows where it
  // goes. Which is also why `placed` has to reach the filter box below.
  useLayoutEffect(() => {
    const node = panel.current;
    // The entry, which is `position: relative` and so is what the panel's own
    // coordinates are relative to. Read as the parent rather than as
    // `offsetParent`, which is null while the panel is still hidden.
    const wrapper = node?.parentElement;
    if (!node || !wrapper) return;
    const { left, top } = menuPlacement(
      props.anchor,
      { width: node.offsetWidth, height: node.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    const box = wrapper.getBoundingClientRect();
    setOffset({ left: left - box.left, top: top - box.top });
  }, [props.anchor, props.kind]);

  // Abandons the menu when a click lands anywhere but inside it. Read with
  // `composedPath()` because this is in a shadow root, where a listener on
  // `window` would only ever see the host; in the capture phase, so a click on
  // D&D Beyond's page underneath the overlay counts as outside too. The same
  // reasoning as `OptionPicker`, and the same shape.
  const dismiss = props.onDismiss;
  useLayoutEffect(() => {
    const onClick = (event: Event) => {
      if (!event.composedPath().some((node) => node === panel.current)) dismiss();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [dismiss]);

  return (
    <div
      ref={panel}
      class="rm"
      style={{
        left: offset ? `${offset.left}px` : "0",
        top: offset ? `${offset.top}px` : "0",
        visibility: offset ? "visible" : "hidden",
      }}
    >
      {props.kind ? (
        <EntityList
          kind={props.kind}
          placed={offset !== null}
          onChoose={props.onChoose}
          onDismiss={props.onDismiss}
        />
      ) : (
        <KindList
          kinds={props.kinds}
          active={props.active}
          onHighlight={props.onHighlight}
          onChooseKind={props.onChooseKind}
        />
      )}
    </div>
  );
}

/**
 * The six kinds. No filter box and nothing focusable: the caret is in the
 * editor, holding the slash command that narrows this list, and a control that
 * took focus would take the command with it.
 */
function KindList({
  kinds,
  active,
  onHighlight,
  onChooseKind,
}: {
  kinds: readonly ReferenceKind[];
  active: number;
  onHighlight: (index: number) => void;
  onChooseKind: (kind: ReferenceKind) => void;
}) {
  if (kinds.length === 0) return <div class="rm-empty">No matches</div>;
  return (
    <ul class="rm-list" role="listbox" aria-label="Add a reference">
      {kinds.map((kind, index) => (
        <li
          key={kind.macro}
          class={index === active ? "rm-option is-active" : "rm-option"}
          role="option"
          aria-selected={index === active ? "true" : "false"}
          // The selection is the argument to the insert this row runs, and
          // anything that takes focus destroys it — the same bargain the format
          // toolbar's buttons make.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onChooseKind(kind)}
        >
          {kind.label}…
        </li>
      ))}
    </ul>
  );
}

/** Everything of one kind, filtered by a box of its own. */
function EntityList({
  kind,
  placed,
  onChoose,
  onDismiss,
}: {
  kind: ReferenceKind;
  /** Whether the panel has been measured, and so can hold the caret. */
  placed: boolean;
  onChoose: (entity: ReferenceEntity) => void;
  onDismiss: () => void;
}) {
  const id = useMemo(() => `rm-${nextId++}`, []);
  const entities = useMemo(() => entitiesOf(kind.path), [kind.path]);
  const [filter, setFilter] = useState("");
  /**
   * The highlighted row, or null to mean "wherever the filter says". Kept apart
   * from the derived default so arrowing somewhere sticks, while typing puts
   * the highlight back where the new matches want it.
   */
  const [picked, setPicked] = useState<number | null>(null);
  const filterEl = useRef<HTMLInputElement>(null);
  const rows = useRef<Array<HTMLLIElement | null>>([]);

  const needle = filter.trim().toLowerCase();
  const matches = useMemo(
    () =>
      entities.flatMap((entity, index) =>
        !needle || entity.name.toLowerCase().includes(needle) ? [index] : [],
      ),
    [entities, needle],
  );
  const active = picked !== null && matches.includes(picked) ? picked : (matches[0] ?? -1);

  // The caret has to come here: the slash command it was in has just been taken
  // out of the prose, so there is nothing left in the document to type into.
  useLayoutEffect(() => {
    // Only once the panel has been placed. Until then it is `visibility:
    // hidden` so it is never drawn in the wrong spot — and a hidden box cannot
    // take focus, so a `focus()` here would silently do nothing and the author
    // would be left typing into the prose behind the menu.
    if (placed) filterEl.current?.focus();
  }, [placed, kind.path]);

  useLayoutEffect(() => {
    if (active !== -1) rows.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const step = (delta: number) => {
    const first = matches[0];
    if (first === undefined) return;
    const at = matches.indexOf(active);
    setPicked(matches[(at + delta + matches.length) % matches.length] ?? first);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Enter":
        event.preventDefault();
        if (entities[active]) onChoose(entities[active]);
        break;
      case "Escape":
      case "Tab":
        event.preventDefault();
        onDismiss();
        break;
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <input
        ref={filterEl}
        class="rm-filter"
        type="text"
        placeholder={`${kind.label}…`}
        aria-label={kind.label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={active === -1 ? undefined : `${id}-o${active}`}
        value={filter}
        onInput={(event) => {
          setFilter((event.target as HTMLInputElement).value);
          setPicked(null);
        }}
      />
      <ul class="rm-list" id={`${id}-list`} role="listbox" aria-label={kind.label}>
        {entities.map((entity, index) => (
          <li
            key={entity.slug}
            ref={(node) => {
              rows.current[index] = node;
            }}
            id={`${id}-o${index}`}
            class={index === active ? "rm-option is-active" : "rm-option"}
            role="option"
            aria-selected={index === active ? "true" : "false"}
            // Hidden rather than dropped, so the list never reshuffles under the
            // cursor between keystrokes.
            hidden={!matches.includes(index)}
            onClick={() => onChoose(entity)}
            onMouseEnter={() => setPicked(index)}
          >
            {entity.name}
          </li>
        ))}
      </ul>
      <div class="rm-empty" hidden={matches.length > 0}>
        No matches
      </div>
    </div>
  );
}
