/**
 * A modal that asks before something that can't be taken back.
 *
 * The block's other destructive actions arm in place — the trash on a section
 * turns into "Remove? ✓ ✕" and that is enough, because what would be lost is
 * the thing you just clicked. This is for the ones where it isn't: taking the
 * crown off a creature reaches into two sections the author isn't looking at,
 * and a two-glyph confirm has nowhere to say so.
 *
 * Focus lands on Cancel, not on the confirm: the dialog exists because the
 * answer might be no.
 */
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** Only one dialog is ever up at a time, and ids are scoped to the shadow root. */
const TITLE_ID = "sb-dialog-title";

export interface ConfirmDialogProps {
  title: string;
  /** Names the action rather than agreeing with the question: "Remove". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** What will be lost, in the author's own terms. */
  children: ComponentChildren;
}

export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    cancel.current?.focus();
  }, []);

  // Capture phase, and it stops there: while this is up, Escape means "not
  // this" and nothing underneath should also act on it.
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      class="sb-dialog-backdrop"
      // The backdrop is a real element covering the page, so "clicked outside"
      // is just a click that landed on it rather than on the card.
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div class="sb-dialog" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
        <h2 class="sb-dialog-title" id={TITLE_ID}>
          {title}
        </h2>
        <div class="sb-dialog-body">{children}</div>
        <div class="sb-dialog-actions">
          <button type="button" class="sb-dialog-cancel" ref={cancel} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="sb-dialog-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
