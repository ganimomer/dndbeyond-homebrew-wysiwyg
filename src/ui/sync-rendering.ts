/**
 * Makes Preact re-render synchronously, the moment state changes.
 *
 * By default Preact batches updates into a microtask, which is the right call
 * for an ordinary app. It is the wrong one here, for now, because this editor
 * still leans on the re-render landing *inside* the event that caused it:
 *
 *   - a mini-form's click-away is registered during the click that opened the
 *     form, and only survives because the form is on screen before that click's
 *     capture phase has finished;
 *   - the render loop opens a just-revealed field's picker by looking for it in
 *     the block it has only just drawn;
 *   - the session store notifies synchronously for exactly this reason.
 *
 * A microtask's delay breaks all three, quietly. So while the hand-drawn render
 * loop and the components share a tree, everything renders eagerly.
 *
 * Transitional: this goes when the last field becomes a component and the
 * guards it props up are deleted, at which point batching is free to come back.
 */
import { options } from "preact";

options.debounceRendering = (process) => process();
