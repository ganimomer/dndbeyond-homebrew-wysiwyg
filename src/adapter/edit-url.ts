/**
 * Keeping up with D&D Beyond's monster edit URL.
 *
 * The URL is `<id>-<slug>/edit`, and the slug is derived from the monster's
 * name — so renaming a creature moves it, and the old URL starts answering
 * `404`. Every save is answered with a `302` to the monster's *canonical* edit
 * URL, so the response we already follow carries the new slug: that redirect,
 * not any guess at how DDB slugifies a name, is what we track.
 */

/** `/homebrew/creations/monsters/<id>[-<slug>]/edit` — id captured, slug free-form. */
const EDIT_PATH = /^\/homebrew\/creations\/monsters\/(\d+)(?:-[^/]*)?\/edit\/?$/i;

/** The same path, capturing `<id>-<slug>` whole — and only when it has a slug. */
const SLUGGED_EDIT_PATH = /^\/homebrew\/creations\/monsters\/(\d+-[^/]+)\/edit\/?$/i;

function monsterId(url: URL): string | null {
  return EDIT_PATH.exec(url.pathname)?.[1] ?? null;
}

/** Same page, so a bare trailing slash mustn't read as a move. */
function samePath(a: URL, b: URL): boolean {
  const trim = (path: string) => path.replace(/\/$/, "");
  return trim(a.pathname) === trim(b.pathname);
}

function parse(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * The URL the page should move to after a save, or `null` to stay put.
 *
 * Only a genuine reslug of the monster we're editing counts: same origin, same
 * numeric id, different path. Everything else — an unchanged URL, a sign-in
 * bounce, an error page, another monster — yields `null`, so a surprising
 * response can never navigate us away from the form.
 */
export function renamedEditUrl(current: string, response: string): string | null {
  const from = parse(current);
  const to = parse(response);
  if (!from || !to || from.origin !== to.origin) return null;

  const id = monsterId(from);
  if (!id || id !== monsterId(to)) return null;

  return samePath(from, to) ? null : to.href;
}

/**
 * The creature's public page, given the edit page's URL — or `null` when there
 * isn't one to go to.
 *
 * `/monsters/<id>-<slug>`: the very segment the edit URL already carries, moved
 * out from under `/homebrew/creations/`. Reused verbatim rather than rebuilt
 * from the name, for the same reason `renamedEditUrl` exists — we don't know
 * how DDB slugifies, and a slug that's off by a character answers `404` just as
 * a missing one does. Which is why a slugless edit URL yields `null`: the id on
 * its own names no page.
 */
export function detailsUrl(href: string): string | null {
  const url = parse(href);
  if (!url) return null;
  const segment = SLUGGED_EDIT_PATH.exec(url.pathname)?.[1];
  return segment ? new URL(`/monsters/${segment}`, url.origin).href : null;
}
