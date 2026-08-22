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
import type { ReferenceSource, ReferenceTooltip, RefToken } from "./types.js";

const ORIGIN = "https://www.dndbeyond.com";

/** How many lookups may be in flight at once — good manners, not a limit we hit. */
const MAX_IN_FLIGHT = 2;

/** The numbered slug DDB redirects to: `/spells/2065-detect-magic`. */
const NUMBERED = /\/(\d+)-[^/]*\/?$/;

export interface DdbReferenceSourceOptions {
  /** Injected so the resolver unit-tests without a network. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests; production is always DDB's own origin. */
  origin?: string;
}

/**
 * Thrown internally to mark "we couldn't ask" as distinct from "there is
 * nothing there". Only the latter is worth remembering — see `lookup`.
 */
class Unreachable extends Error {}

export class DdbReferenceSource implements ReferenceSource {
  private readonly fetchImpl: typeof fetch;
  private readonly origin: string;
  /** Settled answers, keyed `path/slug`. Null means DDB has nothing to say. */
  private readonly results = new Map<string, ReferenceTooltip | null>();
  /** In-progress lookups, so one token hovered twice makes one request. */
  private readonly inFlight = new Map<string, Promise<ReferenceTooltip | null>>();

  constructor(options: DdbReferenceSourceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.origin = options.origin ?? ORIGIN;
  }

  async lookup(token: RefToken): Promise<ReferenceTooltip | null> {
    const target = refToTarget(token);
    if (!target) return null;

    const key = `${target.path}/${target.slug}`;
    if (this.results.has(key)) return this.results.get(key) ?? null;

    const running = this.inFlight.get(key);
    if (running) return running;
    if (this.inFlight.size >= MAX_IN_FLIGHT) return null;

    const request = this.resolve(target)
      .then((tooltip) => {
        // A settled answer — including "there is nothing there" — is worth
        // remembering, so a repeated token costs nothing.
        this.results.set(key, tooltip);
        return tooltip;
      })
      .catch((error) => {
        // But a request that never got an answer is not. Caching an offline
        // blip would leave tooltips dead until the panel is reopened, and
        // nobody would ever connect the two.
        if (!(error instanceof Unreachable)) this.results.set(key, null);
        return null;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  /** The id, then the tooltip. Throws `Unreachable` when the network failed. */
  private async resolve(target: ReferenceTarget): Promise<ReferenceTooltip | null> {
    const id = tableId(target) ?? (await this.redirectId(target));
    if (id === null) return null;
    return this.tooltip(target.path, id);
  }

  /**
   * The id off the canonical slug URL's redirect. `res.url` is the page we
   * landed on; cancelling the body means we pay for the redirect chain and the
   * target's headers, not for the page.
   */
  private async redirectId(target: ReferenceTarget): Promise<number | null> {
    const res = await this.get(`${this.origin}/${target.path}/${encodeURIComponent(target.slug)}`);
    await res.body?.cancel().catch(() => {});
    if (!res.ok) return null;
    const match = NUMBERED.exec(new URL(res.url).pathname);
    return match ? Number(match[1]) : null;
  }

  private async tooltip(path: DdbPath, id: number): Promise<ReferenceTooltip | null> {
    const res = await this.get(`${this.origin}/${path}/${id}/tooltip`);
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
   */
  private async get(url: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, { credentials: "include", redirect: "follow" });
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
