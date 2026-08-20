/**
 * Makes Preact re-render synchronously, the moment state changes.
 *
 * By default Preact batches updates into a microtask. Eager rendering was
 * needed while the hand-drawn render loop and the components shared a tree —
 * the loop leaned on a re-render landing inside the event that caused it — and
 * it is kept now for two smaller reasons:
 *
 *   - a mini-form's click-away is registered as the form opens, and only reads
 *     correctly if the form is on screen before that click's capture phase has
 *     finished;
 *   - the tests assert on the DOM immediately after firing an event, which is
 *     what the overlay does to itself anyway.
 *
 * Nothing here is load-bearing for correctness any more; the trees are small
 * enough that the batching is not worth the round of `act()` calls it would
 * cost. If that changes, this is one line and twenty tests.
 */
import { options } from "preact";

options.debounceRendering = (process) => process();
