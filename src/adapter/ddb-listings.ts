/**
 * D&D Beyond's listing records — skills, movements and senses.
 *
 * These are the parts of a monster that aren't form fields. Each is its own
 * server record with its own create/edit/delete endpoints, reachable only
 * through the links in its row, which is why editing one is a request rather
 * than a write. DDB's own flow navigates to a separate page per row; we post
 * the same forms in place.
 *
 * All three work identically apart from four things — the ids D&D Beyond knows
 * the rows by, the table they live in, the path segment in their create URL,
 * and the field names they post — so `listingCollection` takes those and the
 * adapter declares one of each.
 */
import type { SelectOption } from "./types.js";

/** A form field's value, by id. The edit page carries the anti-forgery tokens. */
function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
}

/** One row of a listing table, with the links its actions cell exposes. */
export interface ListingRow {
  /** The first cell — the skill's or movement type's name. */
  name: string;
  /** Remaining cell texts, so callers can read e.g. a movement's note. */
  cells: string[];
  editUrl: string;
  deleteUrl: string;
}

/**
 * Rows of a listing table. Skills and movements aren't form fields — each is
 * its own server record, reachable only through the links in its row.
 */
function listingRows(tableSelector: string): ListingRow[] {
  const table = document.querySelector(tableSelector);
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).flatMap((tr) => {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim());
    const href = (suffix: string) =>
      Array.from(tr.querySelectorAll("a")).find((a) =>
        new RegExp(`/${suffix}$`).test(a.getAttribute("href") ?? ""),
      )?.getAttribute("href") ?? "";
    const name = cells[0] ?? "";
    const deleteUrl = href("delete");
    return name && deleteUrl
      ? [{ name, cells, editUrl: href("edit"), deleteUrl }]
      : [];
  });
}

/**
 * The "Add a …" link's target, which carries the monster id we POST to.
 * `path` is DDB's segment for the record type ("skills", "movement").
 */
function createUrl(path: string): string {
  const anchor = document.querySelector<HTMLAnchorElement>(`a[href*="/monster/${path}/create/"]`);
  const href = anchor?.getAttribute("href");
  if (href) return href;
  // Fall back to the id in our own URL if DDB ever drops the link.
  const id = /\/monsters\/(\d+)/.exec(location.pathname)?.[1];
  return id ? `/monster/${path}/create/${id}` : "";
}

function cookie(name: string): string {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

/**
 * The token DDB's own `ajax-post` links send (`Cobalt.Forms.AjaxPostSubmit`):
 * the `RequestVerificationToken` cookie, refreshed when it's missing. The skill
 * *delete* endpoint accepts nothing else — not the form's two tokens, not an
 * XHR header.
 */
async function requestVerificationToken(): Promise<string> {
  const existing = cookie("RequestVerificationToken");
  if (existing) return existing;
  await fetch("/refresh-request-verification-token", { method: "POST", credentials: "include" });
  return cookie("RequestVerificationToken");
}

/**
 * POSTs a urlencoded body and returns the response text.
 *
 * DDB answers a rejected request with `200` and a redirect to `/error` (the
 * same shape as the signed-out redirect to `/sign-in`), so status alone would
 * report a bogus success.
 */
async function postForm(url: string, body: URLSearchParams): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    body,
    credentials: "include",
    redirect: "follow",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`request failed (${response.status})`);
  if (/\/error|sign-in|login/i.test(new URL(response.url).pathname)) {
    throw new Error("request rejected by D&D Beyond");
  }
  return text;
}

/**
 * Submits a listing record's create or edit form and syncs the live table from
 * the response.
 *
 * DDB's own flow navigates to a separate page per row (which is why adding a
 * skill or movement there saves and reloads the monster); we post the same form
 * in place, reusing the edit page's anti-forgery tokens — those are accepted on
 * these endpoints, so no preliminary GET is needed.
 *
 * The response is the whole edit page with the listing already updated, so the
 * fresh `<tbody>` is lifted straight out of it. That's what gives a new row its
 * real id (needed to edit or delete it later) and, because these tables live
 * inside the observed form, what re-renders the stat block. Parsing a ~530 KB
 * response is banned in `save()` — that runs every few seconds — but this is
 * one deliberate click.
 */
async function submitListingForm(
  url: string,
  tableSelector: string,
  fields: Record<string, string>,
): Promise<void> {
  const html = await postForm(
    url,
    new URLSearchParams({
      "security-token": val("field-security-token"),
      "authenticity-token": val("field-authenticity-token"),
      ...fields,
    }),
  );

  const fresh = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector(`${tableSelector} tbody`);
  const live = document.querySelector(`${tableSelector} tbody`);
  if (fresh && live) live.replaceWith(live.ownerDocument.importNode(fresh, true));
}

/**
 * Deletes the named listing row via its own Delete link. The response is a few
 * dozen bytes of JSON rather than a page, so the row is dropped from the live
 * table by hand — which, the table being inside the form, re-renders.
 */
async function deleteListingRow(tableSelector: string, name: string): Promise<void> {
  const row = listingRows(tableSelector).find((r) => r.name === name);
  if (!row) return;

  await postForm(
    row.deleteUrl,
    new URLSearchParams({ "request-verification-token": await requestVerificationToken() }),
  );

  document
    .querySelector(`${tableSelector} tbody`)
    ?.querySelector(`a[href="${row.deleteUrl}"]`)
    ?.closest("tr")
    ?.remove();
}


/** What a listing collection needs to know about its own kind of record. */
export interface ListingSpec<T> {
  /**
   * DDB's ids for each row name, read once off the create page's `<select>`.
   * Hardcoded because the *edit* page has no such select — it only renders the
   * listing table — and the ids are stable.
   */
  ids: Record<string, string>;
  /** The table the rows live in. */
  table: string;
  /** The record type's segment in DDB's create URL ("skills", "movement"). */
  createPath: string;
  /** What a create or edit posts, beside the anti-forgery tokens. */
  fields(id: string, detail: T, existing?: ListingRow): Record<string, string>;
}

export interface ListingCollection<T> {
  /** Every row type DDB offers, with `selected` marking the ones it has. */
  options(): SelectOption[];
  /** Adds a row. `id` is DDB's own option value. */
  add(id: string, detail: T): Promise<void>;
  /** Changes an existing row, named as the table lists it. */
  update(name: string, detail: T): Promise<void>;
  remove(name: string): Promise<void>;
}

export function listingCollection<T>(spec: ListingSpec<T>): ListingCollection<T> {
  return {
    options() {
      const taken = new Set(listingRows(spec.table).map((row) => row.name));
      return Object.entries(spec.ids).map(([text, value]) => ({
        value,
        text,
        selected: taken.has(text),
      }));
    },

    async add(id, detail) {
      const url = createUrl(spec.createPath);
      if (!url) throw new Error(`${spec.createPath} create URL not found`);
      await submitListingForm(url, spec.table, spec.fields(id, detail));
    },

    async update(name, detail) {
      const row = listingRows(spec.table).find((r) => r.name === name);
      const id = spec.ids[name];
      // Nothing to edit, or a row DDB doesn't know by that name: leave it be
      // rather than posting something it would reject.
      if (!row?.editUrl || !id) return;
      // The existing row rides along, so fields it carries but this edit isn't
      // changing — a movement's "hover" note — aren't quietly erased.
      await submitListingForm(row.editUrl, spec.table, spec.fields(id, detail, row));
    },

    async remove(name) {
      await deleteListingRow(spec.table, name);
    },
  };
}
