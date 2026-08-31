/**
 * What D&D Beyond says a reference means.
 *
 * Their own stat-block pages hover a condition or a spell and show a definition;
 * this is the same definition, fetched the same way, so the preview borrows
 * their compendium rather than growing one of its own.
 *
 * The endpoint is `GET /<path>/<id>/tooltip`, which answers with a parenthesised
 * JSON literal — `({"Type":"condition","Id":2,"Tooltip":"<div …>"})` — left over
 * from being consumed as JSONP by DDB's own tooltip widget. There is no token
 * and no CSRF header, but **entitlement rides on the session cookie**: signed
 * out, anything outside the SRD answers `{"Type":"blocked"}` instead. We fetch
 * same-origin from a dndbeyond.com page, so the author sees exactly the books
 * they own — the same as anywhere else on the site.
 *
 * The id is the hard part, because a macro carries a name. Three tiers, cheapest
 * first: the harvested table for the closed compendiums, then the canonical slug
 * URL, which 301s to the numbered one (`/spells/detect-magic` →
 * `/spells/2065-detect-magic`) — we read the id off the redirect and cancel the
 * body, so the page itself is never downloaded. Three of the compendiums have
 * no page of their own and are browsed somewhere else; the target says where.
 *
 * And one macro doesn't say which compendium it means at all. `[items]` is
 * written for a magic item and, in D&D Beyond's own 2024 Gear rows, for a
 * greatsword — so it arrives with four candidates rather than one (see
 * `refToTargets`). They are tried in turn, but the first one that *answers* is
 * not the answer: the equipment compendiums number their contents separately,
 * so `/weapons/17` and `/armor/17` are both real and only one of them is
 * Splint. So a multi-candidate lookup believes a tooltip only when the name in
 * it is the name it asked for — see `nameFits`.
 */
import { REFERENCE_IDS } from "./ddb-reference-ids.js";
import {
  refKey,
  refToTargets,
  slugify,
  type DdbPath,
  type ReferenceTarget,
} from "./ddb-reference-map.js";
import type { ReferenceIdStore } from "./reference-id-store.js";
import { Dropped, TaskQueue, type Priority, type Queued } from "./task-queue.js";
import type { LookupOptions, ReferenceSource, ReferenceTooltip, RefToken } from "./types.js";

const ORIGIN = "https://www.dndbeyond.com";

/** The numbered slug DDB redirects to: `/spells/2065-detect-magic`. */
const NUMBERED = /\/(\d+)-([^/]*)\/?$/;

export interface DdbReferenceSourceOptions {
  /** Injected so the resolver unit-tests without a network. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests; production is always DDB's own origin. */
  origin?: string;
  /**
   * Where ids learned from a redirect are remembered between sessions. Omitted
   * in tests, so this module never reaches for `platform/browser.js` — the
   * polyfill throws outside an extension context.
   */
  idStore?: ReferenceIdStore;
  /** Injected in tests to make the queue's ordering observable. */
  queue?: TaskQueue;
}

/**
 * Thrown internally to mark "we couldn't ask" as distinct from "there is
 * nothing there". Only the latter is worth remembering — see `lookup`.
 */
class Unreachable extends Error {}

/** Where a canonical slug URL landed. */
interface Landing {
  id: number;
  /**
   * The slug in the numbered URL — D&D Beyond's own spelling of the record's
   * name, which is a better thing to check a tooltip against than the slug we
   * asked with. Absent when the id came from a table or the store instead.
   */
  slug?: string;
}

export class DdbReferenceSource implements ReferenceSource {
  private readonly fetchImpl: typeof fetch;
  private readonly origin: string;
  private readonly idStore: ReferenceIdStore | null;
  private readonly queue: TaskQueue;
  /** Settled answers, keyed by `refKey`. Null means DDB has nothing to say. */
  private readonly results = new Map<string, ReferenceTooltip | null>();
  /**
   * Lookups queued or running, so one reference asked about twice — by two
   * copies of the token, or by a preload the pointer then caught up with —
   * makes one request.
   */
  private readonly pending = new Map<string, Queued<ReferenceTooltip | null>>();
  /** Settled entitlement answers, keyed `path/id`. See `blocked`. */
  private readonly entitlement = new Map<string, boolean>();

  constructor(options: DdbReferenceSourceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.origin = options.origin ?? ORIGIN;
    this.idStore = options.idStore ?? null;
    this.queue = options.queue ?? new TaskQueue();
  }

  async lookup(token: RefToken, options: LookupOptions = {}): Promise<ReferenceTooltip | null> {
    const priority = options.priority ?? "interactive";
    const key = refKey(token);
    if (key === null) return null;
    const targets = refToTargets(token);

    if (this.results.has(key)) return this.results.get(key) ?? null;

    const running = this.pending.get(key);
    if (running) {
      // The pointer caught up with a preload: it jumps the queue rather than
      // being asked for a second time.
      if (priority === "interactive") running.promote();
      return running.result;
    }

    const queued = this.queue.run(() => this.resolve(targets, priority), priority);
    const request: Queued<ReferenceTooltip | null> = {
      promote: queued.promote,
      result: queued.result
        .then((tooltip) => {
          // A settled answer — including "there is nothing there" — is worth
          // remembering, so a repeated token costs nothing.
          this.results.set(key, tooltip);
          return tooltip;
        })
        .catch((error) => {
          // But a request that never got an answer is not. Caching an offline
          // blip would leave tooltips dead until the panel is reopened, and
          // nobody would ever connect the two. A dropped preload is the same
          // kind of non-answer, so it takes the same branch.
          const unanswered = error instanceof Unreachable || error instanceof Dropped;
          if (!unanswered) this.results.set(key, null);
          return null;
        })
        .finally(() => {
          this.pending.delete(key);
        }),
    };

    this.pending.set(key, request);
    return request.result;
  }

  /**
   * Discards preloads nobody is waiting on. Called when the panel closes, so a
   * dismissed overlay doesn't leave twenty requests queued behind it.
   */
  dropPending(): void {
    this.queue.drop("background");
  }

  /**
   * Whether D&D Beyond refuses this record to this author, or null when it
   * didn't say.
   *
   * The same tooltip a hover would fetch, asked for its `Type` rather than its
   * prose: something outside the author's library answers `"blocked"` instead of
   * the record. That is the only thing this reads as a refusal. A response that
   * wasn't `ok` is a *non*-answer and comes back null — measured, those are a
   * creature the author wrote themselves (500 at this endpoint) and an id that
   * isn't a creature at all (404), and neither is D&D Beyond saying no.
   *
   * Takes the id rather than a token because the caller has one: a listing row
   * carries its own, so this skips the redirect probe that makes a lookup by
   * name expensive.
   *
   * Answers are remembered for the session and no longer. An id, once learned,
   * is true forever and is written to disk; this is true only until the author
   * buys the book, and a padlock left on a creature they now own would be a lie
   * with nothing to correct it.
   */
  async blocked(
    path: DdbPath,
    id: number,
    options: LookupOptions = {},
  ): Promise<boolean | null> {
    const key = `${path}/${id}`;
    const known = this.entitlement.get(key);
    if (known !== undefined) return known;
    // Through the queue, like a lookup: a listing is twenty of these at once,
    // and the reserved slot is what stops them making a hover wait.
    const priority = options.priority ?? "background";
    let tooltip: ReferenceTooltip | null;
    try {
      tooltip = await this.queue.run(() => this.tooltip(path, id, priority), priority).result;
    } catch {
      // Unreachable, or a task dropped before it ran. Not an answer, and not
      // worth remembering — see the same reasoning in `lookup`.
      return null;
    }
    if (!tooltip) return null;
    const blocked = tooltip.type === "blocked";
    this.entitlement.set(key, blocked);
    return blocked;
  }

  /**
   * The first candidate that answers with the thing we asked about. Throws
   * `Unreachable` when the network failed.
   *
   * The name check only applies where there is a choice to get wrong. With one
   * candidate the macro has already said which compendium this is, so a
   * tooltip that came back *is* the answer — and checking it there could only
   * ever throw away a good one over a name DDB spells differently from its own
   * slug.
   */
  private async resolve(
    targets: readonly ReferenceTarget[],
    priority: Priority,
  ): Promise<ReferenceTooltip | null> {
    const ambiguous = targets.length > 1;
    // One probe per URL: three of `[items]`'s four candidates are browsed at
    // the same `/equipment` page, and that probe is the expensive tier.
    const probed = new Map<string, Landing | null>();
    for (const target of targets) {
      const found = await this.identify(target, priority, probed);
      if (!found) continue;
      const tooltip = await this.tooltip(target.path, found.id, priority);
      if (!tooltip) continue;
      if (ambiguous && !nameFits(tooltip.html, found.slug ?? target.slug)) continue;
      return tooltip;
    }
    return null;
  }

  /** Which record in this compendium the name means: table, then store, then DDB. */
  private async identify(
    target: ReferenceTarget,
    priority: Priority,
    probed: Map<string, Landing | null>,
  ): Promise<Landing | null> {
    const known = tableId(target) ?? this.learnedId(target);
    // No slug with it: an id we already knew came with no page to read one off.
    // `resolve` falls back to the slug it asked for, which is what named it.
    if (known !== null) return { id: known };
    return this.redirectId(target, priority, probed);
  }

  /** An id this browser learned from a redirect on some earlier visit. */
  private learnedId(target: ReferenceTarget): number | null {
    return this.idStore?.get(target) ?? null;
  }

  /**
   * Where the canonical slug URL's redirect landed. `res.url` is the page we
   * landed on; cancelling the body means we pay for the redirect chain and the
   * target's headers, not for the page.
   */
  private async redirectId(
    target: ReferenceTarget,
    priority: Priority,
    probed: Map<string, Landing | null>,
  ): Promise<Landing | null> {
    // `browse` where the compendium has no page of its own — see `BROWSED_AT`.
    const url = `${this.origin}/${target.browse ?? target.path}/${encodeURIComponent(target.slug)}`;
    const landing = probed.has(url)
      ? (probed.get(url) ?? null)
      : await this.probe(url, priority, probed);
    if (!landing) return null;
    // This is the expensive tier — DDB's slug URL redirects to a whole rendered
    // page, and we wait on it being built even though we throw the body away.
    // Roughly a second, so it is worth never paying twice for the same name.
    // Remembered per candidate: a rejected one is still a real id in the
    // compendium that answered, and knowing it saves the probe, not the check.
    this.idStore?.remember(target, landing.id);
    return landing;
  }

  private async probe(
    url: string,
    priority: Priority,
    probed: Map<string, Landing | null>,
  ): Promise<Landing | null> {
    const res = await this.get(url, priority);
    await res.body?.cancel().catch(() => {});
    const match = res.ok ? NUMBERED.exec(new URL(res.url).pathname) : null;
    const landing = match ? { id: Number(match[1]), slug: match[2] } : null;
    probed.set(url, landing);
    return landing;
  }

  private async tooltip(
    path: DdbPath,
    id: number,
    priority: Priority,
  ): Promise<ReferenceTooltip | null> {
    const res = await this.get(`${this.origin}/${path}/${id}/tooltip`, priority);
    if (!res.ok) return null;
    const payload = parseEnvelope(await res.text());
    const html = payload && typeof payload.Tooltip === "string" ? payload.Tooltip : "";
    if (!html.trim()) return null;
    return {
      html,
      type: typeof payload?.Type === "string" ? payload.Type : "",
      url: typeof payload?.Url === "string" ? payload.Url : undefined,
    };
  }

  /**
   * `credentials: "include"` is load-bearing, not decoration: it is the measured
   * difference between a real spell and a paywall stub. Don't let a tidy-up
   * delete it as redundant with the same-origin default.
   *
   * `priority: "low"` on a preload hands the browser's own scheduler the job of
   * keeping background warming behind whatever the page actually needs. It is a
   * hint, and it is ignored where unsupported — which is the right failure.
   *
   * (`redirect: "manual"` looks like the obvious way to read the id off the 301
   * without waiting for DDB to render the page it points at. It is not: a
   * manual-redirect fetch yields an opaque response with no URL and no readable
   * headers. Measured and confirmed — don't re-derive it.)
   */
  private async get(url: string, priority: Priority): Promise<Response> {
    const init: RequestInit & { priority?: "high" | "low" | "auto" } = {
      credentials: "include",
      redirect: "follow",
    };
    if (priority === "background") init.priority = "low";
    try {
      return await this.fetchImpl(url, init);
    } catch (error) {
      throw new Unreachable(String(error));
    }
  }
}

/** The harvested id for a closed-compendium slug, if we shipped one. */
function tableId(target: ReferenceTarget): number | null {
  return REFERENCE_IDS[target.path]?.[target.slug] ?? null;
}

/**
 * Whether this tooltip is about the thing we asked about.
 *
 * Only consulted where a macro left the compendium open (see the module note),
 * and it compares slugs rather than words because that is the one spelling both
 * sides agree on: the name in the header is what D&D Beyond's own URL slug is
 * built from, so `Crossbow, Heavy` and `crossbow-heavy` are the same answer
 * while the display text in the macro — `Heavy Crossbow` — is not.
 *
 * A header we can't read a name out of counts as a miss, which costs a hover
 * that could have worked if their markup changes. That is the right way round:
 * the failure this guards against is a *confident wrong answer* — Splint Armor
 * explained as a Shortbow, in D&D Beyond's own styling, with nothing to say it
 * is wrong.
 */
function nameFits(html: string, slug: string): boolean {
  const name = tooltipName(html);
  return name !== "" && slugify(name) === slug;
}

/**
 * The name out of a tooltip's header.
 *
 * Three shapes, all of them theirs: a weapon puts the name in the title div as
 * text (`<div class="tooltip-header-title">Greatsword </div>`), a magic item
 * wraps it in a span, and a condition has no title div and puts the name
 * straight in the header text. What is common is the `.badge` beside it —
 * "Legacy: this doesn't reflect the latest rules and lore" — which is prose
 * about the record rather than its name, and has to come off first.
 */
function tooltipName(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const header =
    template.content.querySelector(".tooltip-header-title") ??
    template.content.querySelector(".tooltip-header-text");
  if (!header) return "";
  for (const badge of header.querySelectorAll(".badge")) badge.remove();
  return header.textContent?.trim() ?? "";
}

/**
 * DDB's response is a JSONP call's argument with the call stripped off, so it
 * arrives wrapped in parentheses. Unwrap it, but fall back to plain JSON so an
 * endpoint that stops wrapping doesn't take the feature with it.
 */
function parseEnvelope(text: string): Record<string, unknown> | null {
  const body = text.trim();
  const json = body.startsWith("(") && body.endsWith(")") ? body.slice(1, -1) : body;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
