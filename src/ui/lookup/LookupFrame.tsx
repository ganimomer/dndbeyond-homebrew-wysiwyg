/**
 * D&D Beyond's own browse page, in the artwork's place, cut down to a picker.
 *
 * The frame itself — its arrival, its cover, its re-dressing on every
 * navigation — is `SideFrame`'s, which the compare panel mounts too. What is
 * here is only what makes this one a *lookup*: which page it opens on, and
 * that a clicked row answers the pending reference and closes the panel.
 */
import type { ReferenceKind } from "../../adapter/reference-catalog.js";
import { SideFrame } from "../shared/SideFrame.js";
import { dressListing } from "./dress-listing.js";
import { useLookup, type LookupState } from "./lookup-context.js";

/**
 * DDB's own browse URL, already searched for whatever the author typed.
 *
 * Usually the compendium's own path. `listing` is for the one that isn't:
 * gear, armor and weapons are three compendiums browsed at one `/equipment`.
 */
export function listingUrl(kind: ReferenceKind, query: string): string {
  const path = `/${kind.listing ?? kind.path}`;
  return query ? `${path}?filter-search=${encodeURIComponent(query)}` : path;
}

export function LookupFrame({ state }: { state: LookupState }) {
  const lookup = useLookup();
  const { kind, query } = state.request;
  return (
    <SideFrame
      // Not the label pluralised: "Equipment" has no plural, and "Equipments"
      // is the sort of thing only a template produces.
      title={`${kind.label} search on D&D Beyond`}
      src={listingUrl(kind, query)}
      open={state.phase === "open"}
      dress={(doc) =>
        dressListing(doc, {
          onPick: (pick) => lookup?.pick(pick),
          onClose: () => lookup?.cancel(),
        })
      }
    />
  );
}
