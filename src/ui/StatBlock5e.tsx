/**
 * A monster in D&D Beyond's 5e layout ("mon-stat-block"): tapered separators, a
 * single six-across ability row, and the #822000 accent. Class names live under
 * `.statblock.v5e` (see statblock-5e.css).
 */
import type { ComponentChildren } from "preact";
import type { Monster, NamedEntry, SectionKey } from "../statblock/model.js";
import { formatModifier, proficiencyBonus, xpForCr } from "../statblock/compute.js";
import { expandInline } from "./prose/inline.js";
import { el } from "./shared/dom.js";
import { SectionBody } from "./prose/SectionBody.js";
import { sectionState } from "./prose/section-state.js";
import { RemoveSection } from "./prose/RemoveSection.js";
import { SECTION_LABEL } from "./prose/section-registry.js";
import { useEditing, useSession } from "./store-context.js";
import { Raw } from "./shared/Raw.js";
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
import { SpeedRow } from "./fields/SpeedRow.js";
import { useCommitAbility } from "./fields/use-commit-ability.js";
import { isVisible, tidbitFields, visibleMeta } from "./fields/registry.js";

/** A "Label value" line. The 2014 block's labels run into their values. */
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
      <span class="label">{`${label} `}</span>
      {children}
    </div>
  );
}

/** A prose value, with `{roll}` and the rest of the sample markup expanded. */
function Inline({ text }: { text: string }) {
  return <Raw node={expandInline(text, el, "roll")} style="display:contents" />;
}

function challengeText(monster: Monster): string {
  const xp = xpForCr(monster.challengeRating);
  return xp !== undefined
    ? `${monster.challengeRating} (${xp.toLocaleString()} XP)`
    : monster.challengeRating;
}

function HeadedSection({
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
    <>
      <h4>
        {SECTION_LABEL[section]}
        {/* The autosave spinner rides the right end of the section's heading. */}
        <SaveSlot origin={section} />
        <RemoveSection section={section} />
      </h4>
      <SectionBody section={section} state={state} readOnly={{ style: "display:contents" }} />
    </>
  );
}

export function StatBlock5e({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const session = useSession();
  const editing = useEditing();
  const commitAbility = useCommitAbility();
  const revealed = session.revealed;

  const traits = sectionState(monster, "traits", session, monster.traits);

  return (
    <div class="statblock v5e">
      {/* Name through tidbits is one section: a reader sees a single block of
          basic information, not a header plus attributes plus abilities plus
          tidbits. The tapered rules are separators *within* it. */}
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

        <hr class="rule" />

        <Line label="Armor Class" dep="dex">
          <ArmorClassField
            monster={monster}
            dexChanged={session.changedAbilities.has("dex")}
            armorBonus={session.armorBonus}
            onCommit={(armorClass) => editing.setArmorClass(armorClass)}
          />
        </Line>
        <Line label="Hit Points" dep="con">
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

        <hr class="rule" />

        <AbilityScores
          monster={monster}
          ruleset="5e"
          adapter={editing}
          onCommit={commitAbility}
        />

        <hr class="rule" />

        {/* Tidbits, in the 2014 block's order and under its longer labels. A
            field the creature has no value for isn't printed — the "Add…" menu
            below brings it back. */}
        {tidbitFields("5e")
          .filter((spec) => isVisible(spec, monster, revealed))
          .map((spec) => (
            <Line key={spec.key} label={spec.label ?? ""} dep={spec.dep} row={spec.key}>
              <Field field={spec.key} monster={monster} />
            </Line>
          ))}
        <Line label="Challenge">
          <Inline text={challengeText(monster)} />
        </Line>
        <Line label="Proficiency Bonus">{formatModifier(proficiencyBonus(monster))}</Line>

        <AddFieldMenu monster={monster} />
      </section>

      {/* Traits alone print with no heading — that is how the 2014 block reads —
          so there is no heading row for the trash to sit in. It rides the top
          right of the body instead, out of sight until the section is pointed
          at (see RemoveSection.css). */}
      {traits.visible ? (
        <>
          <hr class="rule" />
          <div class="sb-traits-removable">
            <RemoveSection section="traits" />
            <SectionBody section="traits" state={traits} readOnly={{ class: "content" }} />
          </div>
        </>
      ) : null}

      <HeadedSection monster={monster} section="actions" entries={monster.actions} />
      <HeadedSection monster={monster} section="bonusActions" entries={monster.bonusActions} />
      <HeadedSection monster={monster} section="reactions" entries={monster.reactions} />
      <HeadedSection
        monster={monster}
        section="legendary"
        entries={monster.legendaryActions}
        intro={monster.legendaryActionsIntro}
      />
      <HeadedSection monster={monster} section="mythic" />
      <HeadedSection monster={monster} section="lair" />
    </div>
  );
}
