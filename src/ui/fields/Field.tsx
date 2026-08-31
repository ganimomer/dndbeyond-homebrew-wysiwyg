/**
 * One optional row's control, chosen by which field it is.
 *
 * The registry says *whether* a row is on the block; this says what goes in it.
 * They are kept apart because the first question is asked in three places (the
 * layout, the "Add…" menu, and the store when it prunes a stale reveal) and the
 * second only here.
 */
import type { Monster } from "../../statblock/model.js";
import type { AdjustmentField } from "../../statblock/adjustments.js";
import { shieldChange } from "../../statblock/armor-class.js";
import { gearHasShield } from "../../adapter/gear.js";
import { reveal, unreveal } from "../../state/session.js";
import { useEditing, useSession, useStore } from "../store-context.js";
import { AdjustmentsRow } from "./AdjustmentsRow.js";
import { SavingThrowsRow } from "./SavingThrowsRow.js";
import { SensesRow } from "./SensesRow.js";
import { SkillsRow } from "./SkillsRow.js";
import { TextRow } from "./TextRow.js";
import type { OptionalField } from "./registry.js";

const ADJUSTMENTS = new Set<string>([
  "damageVulnerabilities",
  "damageResistances",
  "damageImmunities",
  "conditionImmunities",
  "immunities",
]);

export function Field({ field, monster }: { field: OptionalField; monster: Monster }) {
  const store = useStore();
  const editing = useEditing();
  const session = useSession();
  const opened = (key: string) => session.pendingFocus === key;

  /**
   * The ✕ on a text row drops the value *and* the row. Clearing a field that
   * was only ever revealed writes nothing — there is nothing in the form to
   * clear — so the session update is what repaints.
   */
  const clearText = (name: "gear" | "languages") => {
    store.update({ revealed: unreveal(store.getSession(), name) });
    if (monster[name] === "") return;
    if (name === "gear") editing.setGear("");
    else editing.setLanguages("");
  };

  if (ADJUSTMENTS.has(field)) {
    return (
      <AdjustmentsRow
        monster={monster}
        field={field as AdjustmentField}
        adapter={editing}
        autoOpen={opened(`add:${field}`)}
      />
    );
  }

  switch (field) {
    case "skills":
      return (
        <SkillsRow
          monster={monster}
          adapter={editing}
          autoOpen={opened("add:skills")}
          onError={(error) => console.error("[microbrewery] skill update failed", error)}
        />
      );
    case "savingThrows":
      return (
        <SavingThrowsRow
          monster={monster}
          adapter={editing}
          autoOpen={opened("add:savingThrows")}
        />
      );
    case "senses":
      return (
        <SensesRow
          monster={monster}
          adapter={editing}
          autoOpen={opened("add:senses")}
          onError={(error) => console.error("[microbrewery] sense update failed", error)}
        />
      );
    case "gear":
    case "languages":
      return (
        <TextRow
          field={field}
          value={monster[field]}
          label={field === "gear" ? "Gear" : "Languages"}
          placeholder={field === "gear" ? "gear…" : "languages…"}
          onCommit={(name, value) => {
            // An author who deletes the last word is still standing in the row,
            // and a row that vanishes out from under the caret takes the
            // caret with it. Emptying it is therefore a reveal — the same
            // state the "Add…" menu puts a blank row in. The ✕ below, which is
            // the deliberate way out, unreveals.
            if (value === "") store.update({ revealed: reveal(store.getSession(), name) });
            if (name === "gear") {
              // Every way of changing the gear arrives here — the "/" menu, the
              // chip menu's Remove, and plain typing — which is why a shield
              // coming or going is noticed here rather than in any one of them.
              // The offer is left on the session *before* the command, per the
              // convention in `state/lair.ts`: session changes emit
              // synchronously while the monster re-read is coalesced into a
              // frame, so an offer left afterwards would be a render behind the
              // gear it explains.
              const offer = shieldChange(
                monster.armorClass,
                gearHasShield(monster.gear),
                gearHasShield(value),
              );
              if (offer) store.update({ pendingArmor: offer });
              editing.setGear(value);
            } else editing.setLanguages(value);
          }}
          onClear={clearText}
        />
      );
    default:
      // The meta slots aren't rows; the meta line assembles them itself.
      return null;
  }
}
