/**
 * The adapter the editing code talks to.
 *
 * It has the same shape as `PageAdapter` — the same method names, the same
 * arguments — but every mutating call becomes a Command run through the stack
 * instead of a write straight to the page. So the editing modules and, later,
 * the field components need know nothing about commands, undo or autosave: they
 * ask for a skill to be added and that is all they say.
 *
 * The interesting part is what it has to look up before it can hand a command
 * the value it is replacing. The model carries labels ("Darkvision", "Medium or
 * Small") while D&D Beyond's controls carry numeric codes, so a command that
 * must one day put a `<select>` back the way it was needs the *option* it had
 * chosen, not the text the stat block was printing. That translation lives
 * here, once, rather than at every call site.
 */
import type { PageAdapter, SelectOption } from "../adapter/types.js";
import type {
  Ability,
  ArmorClass,
  HitPoints,
  Monster,
  Ruleset,
  SectionKey,
} from "../statblock/model.js";
import type { CommandStack } from "./command.js";
import * as edit from "./commands.js";

/** The option carrying a given label, for turning a name back into DDB's code. */
const valueOf = (options: SelectOption[], text: string): string =>
  options.find((option) => option.text === text)?.value ?? "";

/** The label of a given option, for naming what an edit did. */
const textOf = (options: SelectOption[], value: string): string =>
  options.find((option) => option.value === value)?.text ?? value;

export class EditingAdapter {
  constructor(
    private readonly adapter: PageAdapter,
    private readonly stack: CommandStack,
    /** The creature as the form currently has it — where "before" comes from. */
    private readonly current: () => Monster,
  ) {}

  // -- option lists: straight through, they read the page ---------------------

  hitDieOptions = () => this.adapter.hitDieOptions();
  skillOptions = () => this.adapter.skillOptions();
  movementOptions = () => this.adapter.movementOptions();
  senseOptions = () => this.adapter.senseOptions();
  savingThrowOptions = () => this.adapter.savingThrowOptions();
  damageAdjustmentOptions = () => this.adapter.damageAdjustmentOptions();
  conditionImmunityOptions = () => this.adapter.conditionImmunityOptions();
  sizeOptions = () => this.adapter.sizeOptions();
  typeOptions = () => this.adapter.typeOptions();
  subTypeOptions = () => this.adapter.subTypeOptions();
  alignmentOptions = () => this.adapter.alignmentOptions();

  // -- form fields ------------------------------------------------------------

  setRuleset = (ruleset: Ruleset) => this.run(edit.setRuleset(this.current(), ruleset));

  setLegendary = (on: boolean) => this.run(edit.setLegendary(this.current(), on));

  setAbility = (ability: Ability, score: number) =>
    this.run(edit.setAbility(this.current(), ability, score));

  setArmorClass = (armorClass: ArmorClass) =>
    this.run(edit.setArmorClass(this.current(), armorClass));

  setHitPoints = (hitPoints: HitPoints) => this.run(edit.setHitPoints(this.current(), hitPoints));

  setName = (name: string) => this.run(edit.setName(this.current(), name));

  setGear = (text: string) => this.run(edit.setGear(this.current(), text));

  setLanguages = (text: string) => this.run(edit.setLanguages(this.current(), text));

  setPassivePerception = (value: number) =>
    this.run(edit.setPassivePerception(this.current(), value));

  setDescription = (section: SectionKey, html: string) =>
    this.run(edit.setDescription(this.current(), section, html));

  setSize = (value: string) => this.run(edit.setSize(this.adapter.sizeOptions(), value));

  setType = (value: string) => this.run(edit.setType(this.adapter.typeOptions(), value));

  setAlignment = (value: string) =>
    this.run(edit.setAlignment(this.adapter.alignmentOptions(), value));

  setSubTypes = (values: string[]) =>
    this.run(edit.setSubTypes(this.adapter.subTypeOptions(), values));

  setSavingThrows = (values: string[]) =>
    this.run(edit.setSavingThrows(this.adapter.savingThrowOptions(), values));

  setDamageAdjustments = (values: string[]) =>
    this.run(edit.setDamageAdjustments(this.adapter.damageAdjustmentOptions(), values));

  setConditionImmunities = (values: string[]) =>
    this.run(edit.setConditionImmunities(this.adapter.conditionImmunityOptions(), values));

  // -- listing records --------------------------------------------------------

  addSkill = (value: string, bonus: number): Promise<void> => {
    const name = textOf(this.adapter.skillOptions(), value);
    return this.stack.run(edit.addSkill(name, value, bonus));
  };

  removeSkill = (name: string): Promise<void> => {
    // Captured before it goes: undoing means adding it back with its own bonus.
    const value = valueOf(this.adapter.skillOptions(), name);
    const bonus = this.current().skills[name] ?? 0;
    return this.stack.run(edit.removeSkill(name, value, bonus));
  };

  addMovement = (value: string, speed: number): Promise<void> => {
    const type = textOf(this.adapter.movementOptions(), value);
    return this.stack.run(edit.addMovement(type, value, speed));
  };

  setMovementSpeed = (type: string, speed: number): Promise<void> => {
    const from = this.current().movements.find((m) => m.type === type)?.speed ?? 0;
    return this.stack.run(edit.setMovementSpeed(type, from, speed));
  };

  removeMovement = (type: string): Promise<void> => {
    const value = valueOf(this.adapter.movementOptions(), type);
    const speed = this.current().movements.find((m) => m.type === type)?.speed ?? 0;
    return this.stack.run(edit.removeMovement(type, value, speed));
  };

  addSense = (value: string, note: string): Promise<void> => {
    const type = textOf(this.adapter.senseOptions(), value);
    return this.stack.run(edit.addSense(type, value, note));
  };

  setSenseNote = (type: string, note: string): Promise<void> => {
    const from = this.current().senses.find((s) => s.type === type)?.note ?? "";
    return this.stack.run(edit.setSenseNote(type, from, note));
  };

  removeSense = (type: string): Promise<void> => {
    const value = valueOf(this.adapter.senseOptions(), type);
    const note = this.current().senses.find((s) => s.type === type)?.note ?? "";
    return this.stack.run(edit.removeSense(type, value, note));
  };

  /**
   * Fires off a synchronous command. Its write lands before this returns — the
   * promise only exists for the listing records — so the form mutation and the
   * re-render it causes still happen inside the click that asked for them.
   */
  private run(command: Parameters<CommandStack["run"]>[0]): void {
    void this.stack.run(command);
  }
}
