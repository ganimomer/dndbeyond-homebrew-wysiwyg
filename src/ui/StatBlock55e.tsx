/**
 * A monster in D&D Beyond's 5.5e layout ("mon-stat-block-2024"): Initiative on
 * the AC line, two Mod/Save ability tables, short tidbit labels, and small-caps
 * section headings. Class names live under `.statblock.v55e` (see
 * statblock-55e.css). The structure mirrors the real page's DOM.
 */
import type { ComponentChildren } from "preact";
import type { Monster, NamedEntry, SectionKey } from "../statblock/model.js";
import { formatModifier, initiativeText, proficiencyBonus, xpForCr } from "../statblock/compute.js";
import { SectionBody } from "./prose/SectionBody.js";
import { sectionState } from "./prose/section-state.js";
import { RemoveSection } from "./prose/RemoveSection.js";
import { SECTION_LABEL } from "./prose/section-registry.js";
import { useEditing, useSession } from "./store-context.js";
import { useArmorSuggestion } from "./fields/use-armor-suggestion.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { AbilityScores } from "./fields/AbilityScores.js";
import { AddFieldMenu } from "./fields/AddFieldMenu.js";
import { ArmorClassField } from "./fields/ArmorClassField.js";
import { Field } from "./fields/Field.js";
import { HitPointsField } from "./fields/HitPointsField.js";
import { MetaLine } from "./fields/MetaLine.js";
import { LegendaryChip } from "./fields/LegendaryChip.js";
import { LairChip } from "./fields/LairChip.js";
import { NameRow } from "./NameRow.js";
import { useCommitAbility } from "./fields/use-commit-ability.js";
import { SpeedRow } from "./fields/SpeedRow.js";
import { isVisible, tidbitFields, visibleMeta } from "./fields/registry.js";

/** A "Label value" line used for both attributes and tidbits. */
function Line({
  label,
  children,
  dep,
  row,
}: {
  label: string;
  children: ComponentChildren;
  dep?: string;
  row?: string;
}) {
  return (
    <div class="line" data-dep={dep} data-row={row}>
      <span class="label">{label}</span> {children}
    </div>
  );
}

function crText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  const pb = formatModifier(proficiencyBonus(monster));
  const xpPart = xp !== undefined ? `XP ${xp.toLocaleString()}; ` : "";
  return `${monster.challengeRating} (${xpPart}PB ${pb})`;
}

function DescriptionBlock({
  monster,
  section,
  entries,
  intro,
}: {
  monster: Monster;
  section: SectionKey;
  entries?: NamedEntry[];
  intro?: string;
}) {
  const session = useSession();
  const state = sectionState(monster, section, session, entries, intro);
  if (!state.visible) return null;
  return (
    <section class="description-block">
      <div class="heading">
        {SECTION_LABEL[section]}
        {/* The autosave spinner rides the right end of the section's heading. */}
        <SaveSlot origin={section} />
        <RemoveSection section={section} />
      </div>
      <SectionBody section={section} state={state} readOnly={{ class: "content" }} />
    </section>
  );
}

export function StatBlock55e({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const session = useSession();
  const editing = useEditing();
  const armorOffer = useArmorSuggestion();
  const commitAbility = useCommitAbility();
  const revealed = session.revealed;

  // Print order, and what each one's structured samples are. The headings come
  // from the section registry, so the block and the "Add section" menu agree.
  const sections: Array<[SectionKey, NamedEntry[]?, string?]> = [
    ["traits", monster.traits],
    ["actions", monster.actions],
    ["bonusActions", monster.bonusActions],
    ["reactions", monster.reactions],
    ["legendary", monster.legendaryActions, monster.legendaryActionsIntro],
    ["mythic"],
    ["lair"],
  ];

  return (
    <div class="statblock v55e">
      {/* Name through tidbits is one section: a reader sees a single block of
          basic information, not a header plus attributes plus stats plus
          tidbits. */}
      <section class="basics">
        <NameRow monster={monster} onClose={onClose} />

        {visibleMeta(monster, revealed).size || monster.isLegendary || monster.hasLair ? (
          <div class="meta">
            {/* The sentence is wrapped because it isn't one element: `MetaLine`
                returns a run of slots and the literal separators between them,
                and each of those would otherwise become a flex item of its
                own. */}
            <span class="meta-sentence">
              <MetaLine
                monster={monster}
                shown={visibleMeta(monster, revealed)}
                adapter={editing}
                pendingFocus={session.pendingFocus}
              />
            </span>
            {/* One group, so the two chips travel together to the far end
                rather than one of them landing in the middle of the row. */}
            <span class="status-chips">
              <LegendaryChip monster={monster} />
              <LairChip monster={monster} />
            </span>
          </div>
        ) : null}

        <div class="line">
          <span class="label">AC</span>{" "}
          <span class="value" data-dep="dex">
            <ArmorClassField
              monster={monster}
              dexChanged={session.changedAbilities.has("dex")}
              armorBonus={session.armorBonus}
              suggestion={armorOffer.suggestion}
              onSuggestionDone={armorOffer.done}
              onCommit={(armorClass) => editing.setArmorClass(armorClass)}
            />
          </span>
          {"  "}
          <span class="label">Initiative</span>{" "}
          <span class="value" data-dep="dex">
            {initiativeText(monster)}
          </span>
        </div>

        <Line label="HP" dep="con">
          <HitPointsField
            monster={monster}
            conChanged={session.changedAbilities.has("con")}
            dieOptions={() => editing.hitDieOptions()}
            onCommit={(hitPoints) => editing.setHitPoints(hitPoints)}
          />
        </Line>

        <Line label="Speed">
          <SpeedRow
            monster={monster}
            adapter={editing}
            onError={(error) => console.error("[microbrewery] movement update failed", error)}
          />
        </Line>

        <AbilityScores
          monster={monster}
          ruleset="5.5e"
          adapter={editing}
          onCommit={commitAbility}
        />

        {/* Tidbits (short labels, canonical 5.5e order). A field the creature
            has no value for isn't printed at all — the "Add…" menu below brings
            it back. */}
        {tidbitFields("5.5e")
          .filter((spec) => isVisible(spec, monster, revealed))
          .map((spec) => (
            <Line key={spec.key} label={spec.label ?? ""} dep={spec.dep} row={spec.key}>
              <Field field={spec.key} monster={monster} />
            </Line>
          ))}
        <Line label="CR">{crText(monster)}</Line>

        <AddFieldMenu monster={monster} />
      </section>

      <div class="description-blocks">
        {sections.map(([section, entries, intro]) => (
          <DescriptionBlock
            key={section}
            monster={monster}
            section={section}
            entries={entries}
            intro={intro}
          />
        ))}
      </div>
    </div>
  );
}
