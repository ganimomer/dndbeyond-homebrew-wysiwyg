/**
 * Whether the caret is sitting in a slash command, and what has been typed
 * since the slash.
 *
 * Pure and one line of regex, because the interesting half of this feature is
 * everything it *declines* to open on. A slash is a character authors type in
 * ordinary prose — "1d6/round", "60/120 ft.", a fraction — and a menu that
 * popped up over any of those would be worse than no menu. So the slash only
 * counts at the start of a word, and the query it takes is a single unbroken
 * run of letters: the moment a space follows, this returns null and the menu
 * closes on its own.
 *
 * Kept out of `prose-editor.ts` so the whole "does it open, does it close"
 * surface is table-testable without an editor.
 */

/**
 * `\p{L}` rather than `a-z` so a slash command survives an author on a
 * non-English keyboard reaching for it; the type labels themselves are English,
 * and a query that matches nothing simply shows an empty menu.
 */
const SLASH_COMMAND = /(?:^|\s)\/([\p{L}-]*)$/u;

/**
 * The query, or null when this isn't a slash command. `""` means the slash has
 * just been typed and nothing has narrowed the list yet — which is a menu, not
 * a dismissal, so the empty string and null are meaningfully different.
 */
export function slashQuery(textBeforeCaret: string): string | null {
  return SLASH_COMMAND.exec(textBeforeCaret)?.[1] ?? null;
}

/** How many characters back the command runs, so the editor can delete it. */
export function slashCommandLength(query: string): number {
  return query.length + 1;
}
