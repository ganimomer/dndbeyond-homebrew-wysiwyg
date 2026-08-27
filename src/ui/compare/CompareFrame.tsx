/**
 * Another creature, beside the one being written.
 *
 * One frame for both halves of the gesture: D&D Beyond's `/monsters` listing
 * to choose from, then that creature's own page to read and take from. The same
 * frame rather than two, because it is one column and the second half is where
 * the first was going — and because navigating it in place is what makes Back
 * cost nothing to write.
 *
 * Which surgery to run is decided by looking at the page that arrived rather
 * than by trusting the phase, because a frame can end up somewhere neither of
 * us chose: the prose in a stat block links to conditions and source books, and
 * a click on one navigates. A listing is dressed as a picker; anything else is
 * dressed as a creature, which bands what blocks it finds and, finding none,
 * leaves the page alone but still offers the way back.
 *
 * The listing offers every creature D&D Beyond has, and a creature the author
 * hasn't bought answers with a redirect to the marketplace — another origin, so
 * the page arrives unreadable. That is not a failure to hide: it is the only
 * explanation there is for why this one row doesn't open, and `SideFrame` gives
 * it somewhere to be said.
 */
import { useStore } from "../store-context.js";
import { SideFrame } from "../shared/SideFrame.js";
import { dressListing, isListing } from "../lookup/dress-listing.js";
import { listingUrl } from "../lookup/LookupFrame.js";
import { kindByMacro } from "../../adapter/reference-catalog.js";
import { pageReferenceSource } from "../../adapter/reference-source.js";
import { importEntry, sectionHasEntry } from "../../state/import-entry.js";
import { dressMonster } from "./dress-monster.js";
import { monsterUrl, useCompare, type CompareState } from "./compare-context.js";

/** The compendium being browsed, which is the one this panel is about. */
const MONSTERS = kindByMacro("monsters")!;

export function CompareFrame({ state }: { state: CompareState }) {
  const compare = useCompare();
  const store = useStore();
  const reading = state.pick;

  return (
    <SideFrame
      class="cf"
      title={
        reading ? `${reading.name} on D&D Beyond` : "Monster search on D&D Beyond"
      }
      src={reading ? monsterUrl(reading) : (state.listing ?? listingUrl(MONSTERS, ""))}
      open={state.phase !== "closing"}
      blocked={
        <>
          <p>
            D&amp;D Beyond didn't open {reading ? reading.name : "that page"}. Its stat
            block is only there for creatures on your account — this one leads to the
            marketplace instead.
          </p>
          <button type="button" onClick={() => compare?.back()}>
            ← Back to the list
          </button>
        </>
      }
      dress={(doc) =>
        isListing(doc)
          ? dressListing(doc, {
              // Where the row was found, so Back comes back to the same search.
              onPick: (pick) => compare?.pick(pick, doc.location.pathname + doc.location.search),
              onClose: () => compare?.close(),
              // Only here. A row that leads to the marketplace is a dead end for
              // *this* panel, which has to open the page; the reference picker
              // over the same listing asks nothing, because naming a creature
              // needs no entitlement — see `ListingHandlers.lock`.
              lock: async (pick) =>
                (await pageReferenceSource().blocked(MONSTERS.path, pick.id)) === true,
            })
          : dressMonster(doc, {
              onImport: (section, html) => void importEntry(store, section, html),
              onBack: () => compare?.back(),
              onClose: () => compare?.close(),
              clashes: (section, name) => {
                const monster = store.getMonster();
                return !!monster && sectionHasEntry(monster, section, name);
              },
            })
      }
    />
  );
}
