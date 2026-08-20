/**
 * The option picker as an object, for the fields that are still drawn by hand.
 *
 * There is one picker, and it is the Preact component; this is a shell that
 * gives it the imperative surface the old render loop expects — an `element` to
 * append, an `open()` the owner can call, a `destroy()` to tear it down. It
 * exists so that converting the fields one at a time doesn't mean maintaining
 * two implementations of a combobox, which would drift within a week.
 *
 * It goes when the last hand-drawn field does.
 */
import { render } from "preact";
import "../ui/sync-rendering.js";
import { PickerBody, type PickerOption, type PickerTrigger } from "../ui/shared/OptionPicker.js";

export type { PickerOption, PickerTrigger };

export interface OptionPickerOptions {
  trigger: PickerTrigger;
  /** Filter placeholder; defaults to "Filter…". */
  filterPlaceholder?: string;
  /**
   * Names this picker as a field's next control, so the panel can open it on
   * the render that reveals the field (see `StatBlockController.render`).
   */
  focusKey?: string;
}

export class OptionPicker {
  readonly element: HTMLElement;
  readonly focusKey: string | null;

  private isOpen = false;

  constructor(
    private readonly options: PickerOption[],
    private readonly config: OptionPickerOptions,
  ) {
    this.focusKey = config.focusKey ?? null;
    this.element = document.createElement("div");
    this.element.className = "cp";
    this.paint();
  }

  open(): void {
    this.setOpen(true);
  }

  close(): void {
    this.setOpen(false);
  }

  /** Unmounts the component, which detaches its click-away and key handlers. */
  destroy(): void {
    render(null, this.element);
  }

  private setOpen(open: boolean): void {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.element.classList.toggle("open", open);
    this.paint();
  }

  private paint(): void {
    render(
      <PickerBody
        options={this.options}
        trigger={this.config.trigger}
        filterPlaceholder={this.config.filterPlaceholder}
        focusKey={this.config.focusKey}
        open={this.isOpen}
        onOpenChange={(open) => this.setOpen(open)}
      />,
      this.element,
    );
  }
}
