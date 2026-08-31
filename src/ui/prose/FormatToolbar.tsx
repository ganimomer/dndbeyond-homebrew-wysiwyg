/**
 * The bold/italic bar that floats over whichever entry has the caret, and the
 * "+" that adds a reference to it.
 *
 * It exists mostly to answer a question the block itself can't: a new entry is
 * created with bold and italic already switched on, so the author's next
 * keystroke comes out as the name of a trait — but until they type something
 * there is nothing on screen to show that. The lit B says so.
 *
 * Positioned inside the entry rather than portalled, like every other floating
 * thing here (see Artwork's menu): all of this lives in a shadow root, so there
 * is no document body to escape to and no positioning library to escape with.
 */
import type { FormatState, TextFormat } from "../../editor/prose-editor.js";
import { Icon } from "../shared/Icon.js";

const BUTTONS: Array<{ format: TextFormat; icon: "formatBold" | "formatItalic"; label: string }> = [
  { format: "bold", icon: "formatBold", label: "Bold" },
  { format: "italic", icon: "formatItalic", label: "Italic" },
];

/**
 * The selection is the argument to every command in this bar, and a control
 * that takes focus destroys it. Refusing the mousedown keeps the caret where
 * the author left it — and keeps the editor focused, which is the only reason
 * the toolbar is still on screen to be clicked.
 */
const keepTheCaret = (event: MouseEvent) => event.preventDefault();

export function FormatToolbar({
  format,
  onToggle,
  onAdd,
}: {
  format: FormatState;
  onToggle: (format: TextFormat) => void;
  /** Opens the reference menu. Left off where there is nothing to add to. */
  onAdd?: (anchor: DOMRect) => void;
}) {
  return (
    <div class="sb-format-bar" role="toolbar" aria-label="Text formatting">
      {BUTTONS.map((button) => (
        <button
          key={button.format}
          type="button"
          class="sb-format-button"
          aria-label={button.label}
          aria-pressed={format[button.format]}
          onMouseDown={keepTheCaret}
          onClick={() => onToggle(button.format)}
        >
          <Icon name={button.icon} size={16} />
        </button>
      ))}
      {onAdd ? (
        <button
          type="button"
          class="sb-format-button sb-format-add"
          aria-label="Add…"
          title="Add…"
          onMouseDown={keepTheCaret}
          // The menu hangs off the button rather than off the caret, because
          // there is no slash on the page to hang it from — and the button is
          // where the author is looking.
          onClick={(event) => onAdd((event.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          <Icon name="add" size={16} />
        </button>
      ) : null}
    </div>
  );
}
