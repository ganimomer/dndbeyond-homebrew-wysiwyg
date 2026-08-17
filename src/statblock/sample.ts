import type { Monster } from "./model.js";

/** A fully-populated example used for the preview until the page is wired. */
export function sampleMonster(): Monster {
  return {
    name: "Thornbound Dryad",
    size: "Medium",
    type: "fey",
    alignment: "neutral good",
    armorClass: "13 (natural armor)",
    hitPoints: "45 (7d8 + 14)",
    speed: "30 ft.",
    abilities: { str: 12, dex: 14, con: 14, int: 13, wis: 16, cha: 18 },
    savingThrows: { wis: 5, cha: 6 },
    skills: { Perception: 5, Stealth: 4 },
    damageVulnerabilities: "fire",
    damageResistances: "",
    damageImmunities: "",
    conditionImmunities: "charmed",
    senses: "darkvision 60 ft., passive Perception 15",
    languages: "Elvish, Sylvan",
    challengeRating: "2",
    traits: [
      {
        name: "Innate Spellcasting",
        text: "The dryad's innate spellcasting ability is Charisma (spell save DC 14). She can innately cast the following spells, requiring no material components: at will — {druidcraft}; 3/day each — {entangle}, {goodberry}; 1/day each — {barkskin}, {pass without trace}.",
      },
      {
        name: "Magic Resistance",
        text: "The dryad has advantage on saving throws against spells and other magical effects.",
      },
      {
        name: "Speak with Beasts and Plants",
        text: "The dryad can communicate with beasts and plants as if they shared a language.",
      },
    ],
    actions: [
      {
        name: "Thorned Staff",
        text: "Melee Weapon Attack: {+4} to hit, reach 5 ft., one target. Hit: {1d8 + 1} bludgeoning damage plus {1d6} piercing damage.",
      },
      {
        name: "Fey Charm",
        text: "The dryad targets one humanoid or beast that she can see within 30 feet of her. If the target can see the dryad, it must succeed on a DC 14 Wisdom saving throw against this magic or be charmed by the dryad.",
      },
    ],
    bonusActions: [
      {
        name: "Bramble Step",
        text: "The dryad magically teleports up to 30 feet to an unoccupied space she can see, provided both the origin and destination are within 5 feet of a tree or large plant.",
      },
    ],
    reactions: [],
    legendaryActions: [],
  };
}
