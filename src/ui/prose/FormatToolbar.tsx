/**
 * The bold/italic bar that floats over whichever entry has the caret.
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

export function FormatToolbar({
  format,
  onToggle,
}: {
  format: FormatState;
  onToggle: (format: TextFormat) => void;
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
          // The selection is the argument to the command this button runs, and a
          // button that takes focus destroys it. Refusing the mousedown keeps the
          // caret where the author left it — and keeps `:focus-within` true, which
          // is the only reason the toolbar is still on screen to be clicked.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggle(button.format)}
        >
          <Icon name={button.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
