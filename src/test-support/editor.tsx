/**
 * Renders the stat block the way the overlay does: over a store, with a stubbed
 * D&D Beyond page underneath.
 *
 * Anything that asks about the block as a whole — which rows are printed, in
 * what order, what the layouts disagree about — wants this rather than a
 * component in isolation.
 */
import type { TestContext } from "node:test";
import type { VNode } from "preact";
import type { PageAdapter, SelectOption } from "../adapter/types.js";
import type { Monster, SectionKey } from "../statblock/model.js";
import { EditorStore } from "../state/store.js";
import { StoreContext } from "../ui/store-context.js";
import { StatBlock } from "../ui/StatBlock.js";
import { LookupProvider, type LookupController } from "../ui/lookup/lookup-context.js";
import { CompareProvider, type CompareController } from "../ui/compare/compare-context.js";
import { renderInShadowRoot } from "./render.js";

/** A handful of plausible options, so the rows that offer a picker have one. */
const options = (...labels: string[]) => (): SelectOption[] =>
  labels.map((text, i) => ({ value: String(i + 1), text, selected: false }));

/** A page that reads back the creature it was given and accepts every write. */
export function stubAdapter(monster: Monster, overrides: Partial<PageAdapter> = {}): PageAdapter {
  return {
    kind: "monster",
    matches: () => true,
    read: () => monster,
    write: () => {},
    save: () => Promise.resolve(),
    observe: () => () => {},
    hitDieOptions: options("d6", "d8", "d10"),
    skillOptions: options("Perception", "Stealth", "Survival"),
    movementOptions: options("Walk", "Climb", "Fly"),
    senseOptions: options("Blindsight", "Darkvision", "Truesight"),
    savingThrowOptions: options("STR", "DEX", "CON", "INT", "WIS", "CHA"),
    damageAdjustmentOptions: options("Acid - Resistance", "Fire - Immunity", "Cold - Vulnerability"),
    conditionImmunityOptions: options("Charmed", "Frightened"),
    sizeOptions: options("Small", "Medium", "Large"),
    typeOptions: options("Aberration", "Undead"),
    subTypeOptions: options("elf", "shifter"),
    alignmentOptions: options("Lawful Good", "Unaligned"),
    setRuleset: () => {},
    setAbility: () => {},
    setArmorClass: () => {},
    setHitPoints: () => {},
    setDescription: () => {},
    setLegendary: () => {},
    setHasLair: () => {},
    setMythic: () => {},
    setSavingThrows: () => {},
    setDamageAdjustments: () => {},
    setConditionImmunities: () => {},
    setPassivePerception: () => {},
    setGear: () => {},
    setLanguages: () => {},
    setName: () => {},
    setSize: () => {},
    setType: () => {},
    setSubTypes: () => {},
    setAlignment: () => {},
    chooseAvatar: () => true,
    avatarProblem: () => null,
    onAvatarChosen: () => () => {},
    clearAvatar: () => {},
    addSkill: () => Promise.resolve(),
    removeSkill: () => Promise.resolve(),
    addMovement: () => Promise.resolve(),
    setMovementSpeed: () => Promise.resolve(),
    removeMovement: () => Promise.resolve(),
    addSense: () => Promise.resolve(),
    setSenseNote: () => Promise.resolve(),
    removeSense: () => Promise.resolve(),
    ...overrides,
  } as PageAdapter;
}

/**
 * One component, with a real store behind it.
 *
 * For fields that reach the store directly rather than being handed everything
 * as props — the Gear row, which reads the creature's Dexterity and leaves its
 * armor-class offer on the session. `renderBlock` below is the same idea for
 * the whole block.
 */
export function renderWithStore(
  t: TestContext,
  monster: Monster,
  node: (store: EditorStore) => VNode,
  adapter: Partial<PageAdapter> = {},
) {
  const store = new EditorStore(stubAdapter(monster, adapter));
  store.start();
  t.after(() => store.stop());
  const tree = () => <StoreContext.Provider value={store}>{node(store)}</StoreContext.Provider>;
  const view = renderInShadowRoot(t, tree());
  return { ...view, store, repaint: () => view.rerender(tree()) };
}

export interface RenderBlockOptions {
  /** Optional fields the user has added but not yet filled in. */
  revealed?: Iterable<string>;
  /** Description sections the user has added from the "Add section" button. */
  revealedSections?: Iterable<SectionKey>;
  adapter?: Partial<PageAdapter>;
  /** A lookup to drive by hand — the overlay always provides one. */
  lookup?: LookupController;
  /** A comparison to drive by hand — likewise. */
  compare?: CompareController;
}

export function renderBlock(t: TestContext, monster: Monster, options: RenderBlockOptions = {}) {
  const store = new EditorStore(stubAdapter(monster, options.adapter));
  store.start();
  if (options.revealed) {
    store.update({ revealed: new Set(options.revealed) as never });
  }
  if (options.revealedSections) {
    store.update({ revealedSections: new Set(options.revealedSections) });
  }
  t.after(() => store.stop());

  // The tree the overlay draws, from whatever the store currently holds. `App`
  // repaints by re-rendering exactly this on a store notification; a test that
  // needs the same does it by hand, since nothing here subscribes.
  const tree = () => (
    <StoreContext.Provider value={store}>
      <CompareProvider controller={options.compare}>
        <LookupProvider controller={options.lookup}>
          <StatBlock monster={store.getMonster() ?? monster} />
        </LookupProvider>
      </CompareProvider>
    </StoreContext.Provider>
  );

  const view = renderInShadowRoot(t, tree());
  return { ...view, store, repaint: () => view.rerender(tree()) };
}
