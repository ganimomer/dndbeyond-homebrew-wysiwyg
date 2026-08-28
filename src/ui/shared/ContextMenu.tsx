/**
 * A small kebab context menu styled after D&D Beyond's Encounters "actions"
 * menu (see context-menu.css).
 *
 * Deliberately not an `OptionPicker`. This is a handful of icon-labelled
 * commands, mouse-driven, with Escape as its whole keyboard model; the picker
 * is a search through a long list of like-shaped options and gets the combobox
 * treatment instead.
 */
import { useLayoutEffect, useState } from "preact/hooks";
import { Icon } from "./Icon.js";
import type { IconName } from "./icons.js";

export interface MenuItem {
  label: string;
  /** Material UI icon shown before the label. */
  icon?: IconName;
  /**
   * Takes the icon off the menu's blue and onto D&D Beyond's own red. For the
   * one row whose glyph is DDB's artwork rather than a Material one, so it is
   * read as the thing it came from rather than as another editor control.
   */
  iconTone?: "brand";
  /** Renders the item in a warning colour (e.g. Close). */
  danger?: boolean;
  /**
   * Greys the row out and makes it inert. Say why in `title` — an action that
   * is merely unavailable, with no explanation, reads as a bug.
   *
   * Honoured by `ContextMenu`. `ChipMenu` draws the same `.cm-*` rows from its
   * own markup and ignores this; no chip item sets it today.
   */
  disabled?: boolean;
  /** Native hover tooltip. Chiefly there to explain a `disabled` row. */
  title?: string;
  onClick: () => void;
}

/**
 * A row that opens rows of its own rather than doing something itself.
 *
 * One level deep, and deliberately so: this is a commands menu, and anything
 * that wants a tree of choices wants a picker instead. Kept as a separate
 * shape rather than an optional field on `MenuItem` so that an ordinary item
 * still *has* to say what it does.
 */
export interface SubMenu {
  label: string;
  icon?: IconName;
  items: MenuItem[];
}

export type MenuEntry = MenuItem | SubMenu;

function isSubMenu(entry: MenuEntry): entry is SubMenu {
  return "items" in entry;
}

export interface ContextMenuProps {
  items: MenuEntry[];
  /** Trigger glyph; defaults to the kebab "⋮" when there's no icon either. */
  triggerText?: string;
  /** Material icon shown before the trigger's text, e.g. the "Add…" plus. */
  triggerIcon?: IconName;
  triggerLabel?: string;
  /** Extra class on the trigger, e.g. to reuse the chip "＋" styling. */
  triggerClass?: string;
  /** Extra class on the popover, e.g. "compact" for a long list. */
  menuClass?: string;
}

function rowClass(item: MenuItem): string {
  let cls = "cm-item";
  if (item.danger) cls += " danger";
  if (item.disabled) cls += " disabled";
  return cls;
}

/** The icon gutter every row keeps, filled or not, so the labels line up. */
function RowIcon({ icon, tone }: { icon?: IconName; tone?: "brand" }) {
  if (!icon) return <span class="cm-icon" />;
  return <Icon name={icon} class={tone ? `cm-icon tone-${tone}` : "cm-icon"} />;
}

export function ContextMenu({
  items,
  triggerText,
  triggerIcon,
  triggerLabel,
  triggerClass,
  menuClass,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  // Which submenu is showing, by label. Never outlives the menu itself: a
  // reopened kebab starts at its top level.
  const [openSub, setOpenSub] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setOpenSub(null);
  };

  // Closes on a click anywhere else, or on Escape. `composedPath()` because
  // this lives in a shadow root, where a listener on `window` would otherwise
  // only ever see the host; capture phase so a click on D&D Beyond's own page
  // underneath the overlay counts as outside too.
  useLayoutEffect(() => {
    if (!open) return;
    const onClick = (event: Event) => {
      const trigger = event.composedPath().find((n) => (n as HTMLElement)?.classList?.contains?.("cm"));
      if (!trigger) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A flyout is its own layer to back out of, so Escape takes one step at
      // a time rather than dropping the author out of the menu entirely.
      if (openSub) setOpenSub(null);
      else close();
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, openSub]);

  const label = triggerText ?? (triggerIcon ? "" : "⋮");

  /** One acting row, at either level. */
  const Row = ({ item }: { item: MenuItem }) => (
    <li
      class={rowClass(item)}
      title={item.title}
      aria-disabled={item.disabled ? "true" : undefined}
      onClick={(event) => {
        // A row inside a flyout sits *within* the row that opened it, so
        // without this its click would bubble up and toggle that one shut.
        event.stopPropagation();
        // A disabled row swallows the click and stays put: closing the
        // menu would take its tooltip — the only thing explaining why
        // nothing happened — away with it.
        if (item.disabled) return;
        // Closed first, so the re-render the click sets off finds a
        // settled menu.
        close();
        item.onClick();
      }}
    >
      <RowIcon icon={item.icon} tone={item.iconTone} />
      <span class="cm-label">{item.label}</span>
    </li>
  );

  return (
    <div class={open ? "cm open" : "cm"}>
      <button
        type="button"
        class={triggerClass ? `cm-trigger ${triggerClass}` : "cm-trigger"}
        aria-label={triggerLabel ?? "Options"}
        onClick={(event) => {
          // Without this the click reaches the outside-click listener the very
          // open it just registered, and closes the menu again.
          event.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
      >
        {triggerIcon ? <Icon name={triggerIcon} size={16} /> : null}
        {label}
      </button>
      <ul class={menuClass ? `cm-menu ${menuClass}` : "cm-menu"}>
        {items.map((entry) =>
          isSubMenu(entry) ? (
            <li
              key={entry.label}
              class={openSub === entry.label ? "cm-item cm-parent is-open" : "cm-item cm-parent"}
              aria-haspopup="true"
              aria-expanded={openSub === entry.label ? "true" : "false"}
              onClick={(event) => {
                // Same reason as the trigger's: this click must not reach the
                // outside-click listener and close the menu under it.
                event.stopPropagation();
                setOpenSub(openSub === entry.label ? null : entry.label);
              }}
            >
              <RowIcon icon={entry.icon} />
              <span class="cm-label">{entry.label}</span>
              <span class="cm-caret">›</span>
              <ul class="cm-menu compact cm-submenu">
                {entry.items.map((item) => (
                  <Row key={item.label} item={item} />
                ))}
              </ul>
            </li>
          ) : (
            <Row key={entry.label} item={entry} />
          ),
        )}
      </ul>
    </div>
  );
}
