import type { Monster, Ruleset } from "./model.js";

/**
 * Sample creatures used by the preview until the live form is wired. Each
 * matches its era's real D&D Beyond page so the rendering can be compared
 * side by side:
 *   5.5e → dndbeyond.com/monsters/5195251-vampire (Monster Manual 2024)
 *   5e   → the SRD vampire
 *
 * Inline markup in the text: {roll token}, **bold**, *italic*, and \n breaks.
 */

/** The 5.5e Monster Manual Vampire, matching the linked DDB page 1:1. */
export function sampleVampire55e(): Monster {
  return {
    ruleset: "5.5e",
    name: "Vampire",
    size: "Medium or Small",
    type: "Undead",
    subTypes: [],
    alignment: "Lawful Evil",
    armorClass: { value: 16, type: "" },
    initiative: "+14 (24)",
    hitPoints: { average: 195, dieCount: 23, dieValue: 8, modifier: 92 },
    movements: [
      { type: "Walk", speed: 40 },
      { type: "Climb", speed: 40 },
    ],
    abilities: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 },
    savingThrows: { dex: 9, con: 9, wis: 7, cha: 9 },
    skills: { Perception: 7, Stealth: 9 },
    damageVulnerabilities: [],
    damageResistances: ["Necrotic"],
    damageImmunities: [],
    conditionImmunities: [],
    gear: "",
    senses: [{ type: "Darkvision", note: "120 ft." }],
    passivePerception: 17,
    languages: "Common plus two other languages",
    challengeRating: "13",
    traits: [
      {
        name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
        text: "If the vampire fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Misty Escape",
        text: "If the vampire drops to 0 Hit Points outside its resting place, the vampire uses Shape-Shift to become mist (no action required). If it can't use Shape-Shift, it is destroyed.\nWhile it has 0 Hit Points in mist form, it can't return to its vampire form, and it must reach its resting place within 2 hours or be destroyed. Once in its resting place, it returns to its vampire form and has the Paralyzed condition until it regains any Hit Points, and it regains 1 Hit Point after spending 1 hour there.",
      },
      {
        name: "Spider Climb",
        text: "The vampire can climb difficult surfaces, including along ceilings, without needing to make an ability check.",
      },
      {
        name: "Vampire Weakness",
        text: "The vampire has these weaknesses:\n**Forbiddance.** The vampire can't enter a residence without an invitation from an occupant.\n**Running Water.** The vampire takes 20 Acid damage if it ends its turn in running water.\n**Stake to the Heart.** If a weapon that deals Piercing damage is driven into the vampire's heart while the vampire has the Incapacitated condition in its resting place, the vampire has the Paralyzed condition until the weapon is removed.\n**Sunlight.** The vampire takes 20 Radiant damage if it starts its turn in sunlight. While in sunlight, it has Disadvantage on attack rolls and ability checks.",
      },
    ],
    actions: [
      {
        name: "Multiattack (Vampire Form Only)",
        text: "The vampire makes two Grave Strike attacks and uses Bite.",
      },
      {
        name: "Grave Strike (Vampire Form Only)",
        text: "*Melee Attack Roll:* {+9}, reach 5 ft. *Hit:* 8 {(1d8 + 4)} Bludgeoning damage plus 7 {(2d6)} Necrotic damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of two hands.",
      },
      {
        name: "Bite (Bat or Vampire Form Only)",
        text: "*Constitution Saving Throw:* DC 17, one creature within 5 feet that is willing or that has the Grappled, Incapacitated, or Restrained condition. *Failure:* 6 {(1d4 + 4)} Piercing damage plus 13 {(3d8)} Necrotic damage. The target's Hit Point maximum decreases by an amount equal to the Necrotic damage taken, and the vampire regains Hit Points equal to that amount. A Humanoid reduced to 0 Hit Points by this damage and then buried rises the following sunset as a Vampire Spawn under the vampire's control.",
      },
    ],
    bonusActions: [
      {
        name: "Charm (Recharge 5–6)",
        text: "The vampire casts Charm Person, requiring no spell components and using Charisma as the spellcasting ability (spell save DC 17), and the duration is 24 hours. The Charmed target is a willing recipient of the vampire's Bite, the damage of which doesn't end the spell. When the spell ends, the target is unaware it was Charmed by the vampire.",
      },
      {
        name: "Shape-Shift",
        text: "If the vampire isn't in sunlight or running water, it shape-shifts into a Tiny bat (Speed 5 ft., Fly Speed 30 ft.) or a Medium cloud of mist (Speed 5 ft., Fly Speed 20 ft. [hover]), or it returns to its vampire form. Anything it is wearing transforms with it.\nWhile in bat form, the vampire can't speak. Its game statistics, other than its size and Speed, are unchanged.\nWhile in mist form, the vampire can't take any actions, speak, or manipulate objects. It is weightless and can enter an enemy's space and stop there. If air can pass through a space, the mist can do so, but it can't pass through liquid. It has Resistance to all damage, except the damage it takes from sunlight.",
      },
    ],
    reactions: [],
    hasLair: true,
    isLegendary: true,
    legendaryActionsIntro:
      "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature's turn, the vampire can expend a use to take one of the following actions. The vampire regains all expended uses at the start of each of its turns.",
    legendaryActions: [
      {
        name: "Beguile",
        text: "The vampire casts Command, requiring no spell components and using Charisma as the spellcasting ability (spell save DC 17). The vampire can't take this action again until the start of its next turn.",
      },
      {
        name: "Deathless Strike",
        text: "The vampire moves up to half its Speed, and it makes one Grave Strike attack.",
      },
    ],
  };
}

/** The 5e SRD Vampire, for exercising the classic layout. */
export function sampleVampire5e(): Monster {
  return {
    ruleset: "5e",
    name: "Vampire",
    size: "Medium",
    type: "undead",
    subTypes: ["shapechanger"],
    alignment: "lawful evil",
    armorClass: { value: 16, type: "natural armor" },
    hitPoints: { average: 144, dieCount: 17, dieValue: 8, modifier: 68 },
    movements: [{ type: "Walk", speed: 30 }],
    abilities: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 },
    savingThrows: { dex: 9, wis: 7, cha: 9 },
    skills: { Perception: 7, Stealth: 9 },
    damageVulnerabilities: [],
    damageResistances: [
      "Necrotic",
      "Bludgeoning, Piercing, and Slashing from Nonmagical Attacks",
    ],
    damageImmunities: [],
    conditionImmunities: [],
    gear: "",
    senses: [{ type: "Darkvision", note: "120 ft." }],
    passivePerception: 17,
    languages: "the languages it knew in life",
    challengeRating: "13",
    traits: [
      {
        name: "Shapechanger",
        text: "If the vampire isn't in sunlight or running water, it can use its action to polymorph into a Tiny bat or a Medium cloud of mist, or back into its true form.",
      },
      {
        name: "Legendary Resistance (3/Day)",
        text: "If the vampire fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Misty Escape",
        text: "When it drops to 0 hit points outside its resting place, the vampire transforms into a cloud of mist (as in the Shapechanger trait) instead of falling unconscious, provided that it isn't in sunlight or running water.",
      },
      {
        name: "Regeneration",
        text: "The vampire regains 20 hit points at the start of its turn if it has at least 1 hit point and isn't in sunlight or running water.",
      },
      {
        name: "Spider Climb",
        text: "The vampire can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.",
      },
    ],
    actions: [
      {
        name: "Multiattack (Vampire Form Only)",
        text: "The vampire makes two attacks, only one of which can be a bite attack.",
      },
      {
        name: "Unarmed Strike (Vampire Form Only)",
        text: "*Melee Weapon Attack:* {+9} to hit, reach 5 ft., one creature. *Hit:* 8 {(1d8 + 4)} bludgeoning damage. Instead of dealing damage, the vampire can grapple the target (escape DC 18).",
      },
      {
        name: "Bite (Bat or Vampire Form Only)",
        text: "*Melee Weapon Attack:* {+9} to hit, reach 5 ft., one willing creature, or a creature that is grappled by the vampire, incapacitated, or restrained. *Hit:* 7 {(1d6 + 4)} piercing damage plus 10 {(3d6)} necrotic damage.",
      },
    ],
    bonusActions: [],
    reactions: [],
    isLegendary: true,
    legendaryActionsIntro:
      "The vampire can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The vampire regains spent legendary actions at the start of its turn.",
    legendaryActions: [
      {
        name: "Move",
        text: "The vampire moves up to its speed without provoking opportunity attacks.",
      },
      {
        name: "Unarmed Strike",
        text: "The vampire makes one unarmed strike.",
      },
      {
        name: "Bite (Costs 2 Actions)",
        text: "The vampire makes one bite attack.",
      },
    ],
  };
}

/** Returns the sample creature matching the requested ruleset (default 5.5e). */
export function sampleMonster(ruleset: Ruleset = "5.5e"): Monster {
  return ruleset === "5e" ? sampleVampire5e() : sampleVampire55e();
}
