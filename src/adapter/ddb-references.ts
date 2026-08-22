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
 * body, so the page itself is never downloaded.
 */
import { REFERENCE_IDS } from "./ddb-reference-ids.js";
import { refToTarget, type DdbPath, type ReferenceTarget } from "./ddb-reference-map.js";
import type { ReferenceIdStore } from "./reference-id-store.js";
import { Dropped, TaskQueue, type Priority, type Queued } from "./task-queue.js";
import type { LookupOptions, ReferenceSource, ReferenceTooltip, RefToken } from "./types.js";

const ORIGIN = "https://www.dndbeyond.com";

/** The numbered slug DDB redirects to: `/spells/2065-detect-magic`. */
const NUMBERED = /\/(\d+)-[^/]*\/?$/;

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

export class DdbReferenceSource implements ReferenceSource {
  private readonly fetchImpl: typeof fetch;
  private readonly origin: string;
  private readonly idStore: ReferenceIdStore | null;
  private readonly queue: TaskQueue;
  /** Settled answers, keyed `path/slug`. Null means DDB has nothing to say. */
  private readonly results = new Map<string, ReferenceTooltip | null>();
  /**
   * Lookups queued or running, so one reference asked about twice — by two
   * copies of the token, or by a preload the pointer then caught up with —
   * makes one request.
   */
  private readonly pending = new Map<string, Queued<ReferenceTooltip | null>>();

  constructor(options: DdbReferenceSourceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.origin = options.origin ?? ORIGIN;
    this.idStore = options.idStore ?? null;
    this.queue = options.queue ?? new TaskQueue();
  }

  async lookup(token: RefToken, options: LookupOptions = {}): Promise<ReferenceTooltip | null> {
    const priority = options.priority ?? "interactive";
    const target = refToTarget(token);
    if (!target) return null;

    const key = `${target.path}/${target.slug}`;
    if (this.results.has(key)) return this.results.get(key) ?? null;

    const running = this.pending.get(key);
    if (running) {
      // The pointer caught up with a preload: it jumps the queue rather than
      // being asked for a second time.
      if (priority === "interactive") running.promote();
      return running.result;
    }

    const queued = this.queue.run(() => this.resolve(target, priority), priority);
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

  /** The id, then the tooltip. Throws `Unreachable` when the network failed. */
  private async resolve(
    target: ReferenceTarget,
    priority: Priority,
  ): Promise<ReferenceTooltip | null> {
    const id =
      tableId(target) ?? this.learnedId(target) ?? (await this.redirectId(target, priority));
    if (id === null) return null;
    return this.tooltip(target.path, id, priority);
  }

  /** An id this browser learned from a redirect on some earlier visit. */
  private learnedId(target: ReferenceTarget): number | null {
    return this.idStore?.get(target) ?? null;
  }

  /**
   * The id off the canonical slug URL's redirect. `res.url` is the page we
   * landed on; cancelling the body means we pay for the redirect chain and the
   * target's headers, not for the page.
   */
  private async redirectId(target: ReferenceTarget, priority: Priority): Promise<number | null> {
    const res = await this.get(
      `${this.origin}/${target.path}/${encodeURIComponent(target.slug)}`,
      priority,
    );
    await res.body?.cancel().catch(() => {});
    if (!res.ok) return null;
    const match = NUMBERED.exec(new URL(res.url).pathname);
    if (!match) return null;
    const id = Number(match[1]);
    // This is the expensive tier — DDB's slug URL redirects to a whole rendered
    // page, and we wait on it being built even though we throw the body away.
    // Roughly a second, so it is worth never paying twice for the same name.
    this.idStore?.remember(target, id);
    return id;
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
