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
import { htmlHasContent, sectionBody } from "./prose/sections.js";
import { ProseSection } from "./prose/ProseSection.js";
import { useEditing, useSession } from "./store-context.js";
import { Raw } from "./shared/Raw.js";
import { SaveSlot } from "./shared/SaveSlot.js";
import { AbilityScores } from "./fields/AbilityScores.js";
import { AddFieldMenu } from "./fields/AddFieldMenu.js";
import { ArmorClassField } from "./fields/ArmorClassField.js";
import { Field } from "./fields/Field.js";
import { HitPointsField } from "./fields/HitPointsField.js";
import { MetaLine } from "./fields/MetaLine.js";
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
  heading,
  section,
  entries,
  intro,
}: {
  monster: Monster;
  heading: string;
  section: SectionKey;
  entries?: NamedEntry[];
  intro?: string;
}) {
  const html = monster.descriptionHtml?.[section];
  const editable = htmlHasContent(html);
  const body = editable ? null : sectionBody(monster, section, entries, intro);
  if (!editable && !body) return null;
  return (
    <>
      <h4>
        {heading}
        {/* The autosave spinner rides the right end of the section's heading. */}
        <SaveSlot origin={section} />
      </h4>
      {editable ? (
        <ProseSection section={section} html={html!} />
      ) : (
        <Raw node={body} data-section={section} style="display:contents" />
      )}
    </>
  );
}

export function StatBlock5e({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const session = useSession();
  const editing = useEditing();
  const commitAbility = useCommitAbility();
  const revealed = session.revealed;

  const traitsHtml = monster.descriptionHtml?.traits;
  const traitsEditable = htmlHasContent(traitsHtml);
  const traits = traitsEditable ? null : sectionBody(monster, "traits", monster.traits);

  return (
    <div class="statblock v5e">
      {/* Name through tidbits is one section: a reader sees a single block of
          basic information, not a header plus attributes plus abilities plus
          tidbits. The tapered rules are separators *within* it. */}
      <section class="basics">
        <NameRow monster={monster} onClose={onClose} />

        {visibleMeta(monster, revealed).size ? (
          <div class="meta">
            <MetaLine
              monster={monster}
              shown={visibleMeta(monster, revealed)}
              adapter={editing}
              pendingFocus={session.pendingFocus}
            />
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

      {traitsEditable || traits ? (
        <>
          <hr class="rule" />
          {traitsEditable ? (
            <ProseSection section="traits" html={traitsHtml!} />
          ) : (
            <Raw class="content" node={traits} data-section="traits" />
          )}
        </>
      ) : null}

      <HeadedSection monster={monster} heading="Actions" section="actions" entries={monster.actions} />
      <HeadedSection
        monster={monster}
        heading="Bonus Actions"
        section="bonusActions"
        entries={monster.bonusActions}
      />
      <HeadedSection
        monster={monster}
        heading="Reactions"
        section="reactions"
        entries={monster.reactions}
      />
      <HeadedSection
        monster={monster}
        heading="Legendary Actions"
        section="legendary"
        entries={monster.legendaryActions}
        intro={monster.legendaryActionsIntro}
      />
      <HeadedSection monster={monster} heading="Mythic Actions" section="mythic" />
      <HeadedSection monster={monster} heading="Lair Actions" section="lair" />
    </div>
  );
}
