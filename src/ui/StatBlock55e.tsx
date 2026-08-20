/**
 * A monster in D&D Beyond's 5.5e layout ("mon-stat-block-2024"): Initiative on
 * the AC line, two Mod/Save ability tables, short tidbit labels, and small-caps
 * section headings. Class names live under `.statblock.v55e` (see
 * statblock-55e.css). The structure mirrors the real page's DOM.
 */
import type { ComponentChildren } from "preact";
import type { Monster, NamedEntry, SectionKey } from "../statblock/model.js";
import { formatModifier, initiativeText, proficiencyBonus, xpForCr } from "../statblock/compute.js";
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
    <section class="description-block">
      <div class="heading">
        {heading}
        {/* The autosave spinner rides the right end of the section's heading. */}
        <SaveSlot origin={section} />
      </div>
      {editable ? (
        <ProseSection section={section} html={html!} />
      ) : (
        <Raw class="content" node={body} data-section={section} />
      )}
    </section>
  );
}

export function StatBlock55e({ monster, onClose }: { monster: Monster; onClose?: () => void }) {
  const session = useSession();
  const editing = useEditing();
  const commitAbility = useCommitAbility();
  const revealed = session.revealed;

  const sections: Array<[string, SectionKey, NamedEntry[]?, string?]> = [
    ["Traits", "traits", monster.traits],
    ["Actions", "actions", monster.actions],
    ["Bonus Actions", "bonusActions", monster.bonusActions],
    ["Reactions", "reactions", monster.reactions],
    ["Legendary Actions", "legendary", monster.legendaryActions, monster.legendaryActionsIntro],
    ["Mythic Actions", "mythic"],
    ["Lair Actions", "lair"],
  ];

  return (
    <div class="statblock v55e">
      {/* Name through tidbits is one section: a reader sees a single block of
          basic information, not a header plus attributes plus stats plus
          tidbits. */}
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

        <div class="line">
          <span class="label">AC</span>{" "}
          <span class="value" data-dep="dex">
            <ArmorClassField
              monster={monster}
              dexChanged={session.changedAbilities.has("dex")}
              armorBonus={session.armorBonus}
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
        {sections.map(([heading, section, entries, intro]) => (
          <DescriptionBlock
            key={section}
            monster={monster}
            heading={heading}
            section={section}
            entries={entries}
            intro={intro}
          />
        ))}
      </div>
    </div>
  );
}
