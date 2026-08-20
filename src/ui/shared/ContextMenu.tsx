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
  /** Renders the item in a warning colour (e.g. Close). */
  danger?: boolean;
  onClick: () => void;
}

export interface ContextMenuProps {
  items: MenuItem[];
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

export function ContextMenu({
  items,
  triggerText,
  triggerIcon,
  triggerLabel,
  triggerClass,
  menuClass,
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);

  // Closes on a click anywhere else, or on Escape. `composedPath()` because
  // this lives in a shadow root, where a listener on `window` would otherwise
  // only ever see the host; capture phase so a click on D&D Beyond's own page
  // underneath the overlay counts as outside too.
  useLayoutEffect(() => {
    if (!open) return;
    const onClick = (event: Event) => {
      const trigger = event.composedPath().find((n) => (n as HTMLElement)?.classList?.contains?.("cm"));
      if (!trigger) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const label = triggerText ?? (triggerIcon ? "" : "⋮");

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
          setOpen(!open);
        }}
      >
        {triggerIcon ? <Icon name={triggerIcon} size={16} /> : null}
        {label}
      </button>
      <ul class={menuClass ? `cm-menu ${menuClass}` : "cm-menu"}>
        {items.map((item) => (
          <li
            key={item.label}
            class={item.danger ? "cm-item danger" : "cm-item"}
            onClick={() => {
              // Closed first, so the re-render the click sets off finds a
              // settled menu.
              setOpen(false);
              item.onClick();
            }}
          >
            {item.icon ? <Icon name={item.icon} class="cm-icon" /> : <span class="cm-icon" />}
            <span class="cm-label">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
