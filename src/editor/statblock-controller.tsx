/**
 * The stat block's render loop, as it stood before the Preact conversion.
 *
 * Transitional by design. It still rebuilds the whole block on every form
 * mutation and re-attaches every `wireX` behaviour to the result, which is why
 * it carries focus save/restore, the open-menu teardown lists and the three
 * "don't re-render while the user is mid-edit" guards. All of that exists to
 * work around the rebuild, and all of it goes when the fields become components
 * that Preact can diff in place.
 *
 * What has changed is ownership: it no longer creates or removes anything above
 * the block. It is handed a container that the Preact tree owns, renders into
 * it, and stops when told.
 */
import type { Monster } from "../statblock/model.js";
import type { EditorStore } from "../state/store.js";
import { markChanged, reveal } from "../state/session.js";
import { render } from "preact";
import { renderStatBlock } from "../preview/statblock-view.js";
import type { IslandName } from "../preview/island.js";
import { TextRow } from "../ui/fields/TextRow.js";
import { SkillsRow } from "../ui/fields/SkillsRow.js";
import { SavingThrowsRow } from "../ui/fields/SavingThrowsRow.js";
import { AdjustmentsRow } from "../ui/fields/AdjustmentsRow.js";
import { SensesRow } from "../ui/fields/SensesRow.js";
import { SpeedRow } from "../ui/fields/SpeedRow.js";
import { MetaLine } from "../ui/fields/MetaLine.js";
import { unreveal } from "../state/session.js";
import { hiddenFields, visibleMeta } from "../preview/optional-fields.js";
import { unarmoredAc } from "../statblock/armor-class.js";
import { saveSlot } from "../preview/dom.js";
import { ContextMenu, makeIcon } from "./context-menu.js";
import { applyDependencyHighlights, wireAbilityInputs } from "./ability-editing.js";
import { wireHitPoints } from "./hit-points-editing.js";
import { wireArmorClass } from "./armor-class-editing.js";
import { OptionPicker } from "./option-picker.js";
import { wireSaveToggles } from "./saves-editing.js";
import { ProseEditor } from "./prose-editor.js";
import { applySaveState, HEADER_ORIGIN } from "./save-indicator.js";
import { wireName } from "./name-editing.js";
import { wireAddField } from "./field-visibility.js";
import { NAME_FOCUS_KEY } from "../preview/name-row.js";

export interface StatBlockControllerOptions {
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export class StatBlockController {
  /**
   * The root the block lives under. Focus is read against it rather than the
   * document, because inside a shadow root `document.activeElement` is only ever
   * the host element.
   */
  private readonly shadow: ShadowRoot | Document;
  private unobserve: (() => void) | null = null;
  private rafToken = 0;
  /**
   * Popovers mounted into the current block: the name-row kebab and the "Add…"
   * footer are `ContextMenu`s, the chip rows' "＋" and the meta slots
   * `OptionPicker`s.
   */
  private menus: (ContextMenu | OptionPicker)[] = [];
  /**
   * Click-away listeners belonging to the mini-forms in the current block. They
   * live on `window`, outside the block that gets thrown away, so each render
   * detaches the last one's before the fresh form registers its own.
   */
  private formTeardowns: (() => void)[] = [];
  /**
   * The live editor for the Traits section (the first prose section wired for
   * editing). Persists across re-renders — its host is re-parented into each
   * freshly rendered block rather than rebuilt, so the caret and undo survive.
   */
  private traitsEditor: ProseEditor | null = null;
  private traitsHost: HTMLElement | null = null;
  private unsubscribeSave: (() => void) | null = null;
  /** One persistent host per converted field, keyed by island name. */
  private readonly islands = new Map<string, HTMLElement>();
  /**
   * Best-effort flush when the tab goes away mid-debounce. The save is far too
   * large for `keepalive`, so an immediate unload can still cut it off — but DDB
   * puts up its own unsaved-changes prompt, which usually buys enough time.
   */
  private readonly onBeforeUnload = () => {
    void this.autosave.flush();
  };

  constructor(
    private readonly store: EditorStore,
    /** The element to render into. Owned by the Preact tree, not by us. */
    private readonly container: HTMLElement,
    private readonly options: StatBlockControllerOptions = {},
  ) {
    this.shadow = container.getRootNode() as ShadowRoot | Document;
  }

  /** Mutating the creature goes through commands, never straight to the page. */
  private get editing() {
    return this.store.editing;
  }

  private get autosave() {
    return this.store.autosave;
  }

  /** Renders the block and starts tracking the form. */
  start(): void {
    this.render();
    // Form mutations arrive in bursts — one edit can touch four fields — so
    // they coalesce into a frame. Session changes must not: a mini-form's
    // click-away depends on the re-render landing inside the click that caused
    // it, while that click is still in its capture phase.
    this.unobserve = this.store.subscribe((change) => {
      if (change === "monster") this.scheduleRender();
      else this.render();
    });
    // Save state changes on its own schedule — a request starting or finishing
    // doesn't touch the form — so it repaints the indicators directly rather
    // than waiting for a render.
    this.unsubscribeSave = this.autosave.onStateChange((state) =>
      applySaveState(this.container, state, () => this.autosave.retry()),
    );
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  /** Stops tracking the form and releases everything mounted into the block. */
  stop(): void {
    this.unobserve?.();
    this.unobserve = null;
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.unsubscribeSave?.();
    this.unsubscribeSave = null;
    this.destroyMenus();
    this.destroyForms();
    for (const host of this.islands.values()) render(null, host);
    this.islands.clear();
    this.traitsEditor?.destroy();
    this.traitsEditor = null;
    this.traitsHost = null;
  }

  private close(): void {
    // Taking the overlay down is the panel's job — it owns the host element.
    this.options.onClose?.();
  }

  /** Coalesces bursts of form mutations into a single render per frame. */
  private scheduleRender(): void {
    if (this.rafToken) return;
    this.rafToken = requestAnimationFrame(() => {
      this.rafToken = 0;
      this.render();
    });
  }

  private render(): void {
    // A form mutation while the traits editor holds focus is almost always our
    // own debounced write-back echoing back through observe(). Rebuilding now
    // would re-parent the focused editor and disturb the caret, so skip it; the
    // chrome re-syncs on the next render once editing pauses.
    if (this.traitsEditor?.hasFocus()) return;
    // Same reasoning for the name: it's a contenteditable the user types into a
    // character at a time, and rebuilding the block would drop the caret. The
    // save indicator is unaffected -- it paints from onStateChange, not render().
    if (this.focusedKey() === NAME_FOCUS_KEY) return;
    // And for an open chip picker: its filter text lives in the block itself, so
    // rebuilding would swallow the word being typed and shut the picker.
    if (this.filteringPicker()) return;

    const monster = this.store.getMonster();
    if (!monster) return;
    const session = this.store.getSession();

    this.destroyMenus();
    this.destroyForms();
    const block = renderStatBlock(monster, { revealed: session.revealed });

    const slot = block.querySelector<HTMLElement>(".name-menu");
    if (slot) {
      // The top-area save indicator sits at the row's right end, immediately
      // before the context menu.
      slot.append(saveSlot(HEADER_ORIGIN));
      // Offer only the layout we're not currently in.
      const other = monster.ruleset === "5e" ? "5.5e" : "5e";
      const menu = new ContextMenu([
        {
          label: `Use ${other} stat block`,
          icon: "loop",
          onClick: () => {
            this.editing.setRuleset(other);
          },
        },
      ]);
      this.menus.push(menu);
      // Close is a standalone icon button, pinned to the far right of the row.
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "name-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.append(makeIcon("close"));
      closeBtn.addEventListener("click", () => this.close());
      slot.append(menu.element, closeBtn);
    }

    // Editing an ability writes it back (which re-renders via observe) and
    // records it so its dependents stay flagged across renders. Scores commit
    // on `change`, i.e. on blur — never per keystroke.
    wireAbilityInputs(block, monster, (ability, score) => {
      this.editing.setAbility(ability, score);
      this.store.update({ changedAbilities: markChanged(this.store.getSession(), ability) });
    });
    applyDependencyHighlights(block, session.changedAbilities);

    // Armor class is one stored number the form splits into "what Dexterity
    // gives you" and "what your armor adds". Remember the armor's worth from
    // the pristine form so a later DEX edit has something to preserve.
    this.keepForm(
      wireArmorClass(block, monster, {
        state: session.armorClass,
        dexChanged: session.changedAbilities.has("dex"),
        armorBonus: session.armorBonus,
        onOpen: () => {
          this.store.update({
            armorClass: { draft: { ...monster.armorClass } },
            pendingFocus: "ac:bonus",
          });
        },
        onChange: (draft) => {
          const open = this.store.getSession().armorClass;
          if (open) open.draft = draft;
        },
        onCommit: (armorClass) => {
          this.editing.setArmorClass(armorClass);
          this.store.update({
            armorClass: null,
            // Re-anchor against the Dexterity in force now: the user has
            // reconciled the two, so this is the bonus a *future* DEX edit
            // should preserve.
            armorBonus: armorClass.value - unarmoredAc(monster),
          });
        },
        onCancel: () => {
          this.store.update({ armorClass: null });
        },
      }),
    );

    // Hit points are four fields behind one chip. Opening and cancelling only
    // change our own state — nothing writes to the form, so `observe()` won't
    // fire and we re-render by hand; committing writes and rides autosave.
    this.keepForm(
      wireHitPoints(block, monster, {
        state: session.hitPoints,
        conChanged: session.changedAbilities.has("con"),
        dieOptions: () => this.editing.hitDieOptions(),
        onOpen: () => {
          this.store.update({
            hitPoints: {
              draft: { ...monster.hitPoints },
              baseline: { ...monster.hitPoints },
            },
            pendingFocus: "hp:average",
          });
        },
        onChange: (draft) => {
          const open = this.store.getSession().hitPoints;
          if (open) open.draft = draft;
        },
        onCommit: (hitPoints) => {
          this.editing.setHitPoints(hitPoints);
          this.store.update({ hitPoints: null });
        },
        onCancel: () => {
          this.store.update({ hitPoints: null });
        },
      }),
    );

    // The creature name is a contenteditable in the header row; it commits on
    // blur or Enter, and rides autosave like the rest of the header.
    wireName(block, monster, {
      onCommit: (name) => {
        this.editing.setName(name);
      },
    });

    // 5.5e prints every save as a dot in the ability tables; those cells belong
    // to a table that is still drawn by hand. The 5e chip row is a component.
    wireSaveToggles(block, this.editing);

    // The "Add…" menu at the foot of the section. Revealing a field changes
    // nothing in the form, so `observe()` won't fire — re-render by hand.
    this.menus.push(
      ...wireAddField(block, hiddenFields(monster, session.revealed, monster.ruleset), (spec) => {
        this.store.update({
          revealed: reveal(this.store.getSession(), spec.key),
          pendingFocus: spec.focusKey,
        });
      }),
    );

    // Preserve caret focus across the blur→re-render so tabbing between inputs
    // stays usable. A field we just added (pendingFocus) wins, and gets its
    // default value selected so the user can type straight over it.
    const pending = this.store.takePendingFocus();
    const focusKey = pending ?? this.focusedKey();
    this.container.replaceChildren(block);
    if (!this.openPending(pending)) this.restoreFocus(block, focusKey, pending !== null);

    // Mount after the block is attached: the fields that have become components
    // live in hosts that are moved into the new block, not rebuilt with it.
    this.mountIslands(block, monster, pending);
    this.mountTraitsEditor(block, monster);

    // The block is brand new, so any in-progress save needs re-painting onto it.
    applySaveState(this.container, this.autosave.state, () => this.autosave.retry());
  }

  /**
   * Fills the holes the renderers leave for the fields that have become
   * components.
   *
   * Each field gets one host element, created once and moved into every
   * freshly drawn block rather than rebuilt with it. That is what lets Preact
   * diff the field in place: the input the user is typing into is the same
   * element it was before the block was redrawn, so their half-typed value
   * survives a form mutation that would previously have wiped it.
   *
   * The same trick as the Traits editor below, which needed it first.
   */
  private mountIslands(block: ParentNode, monster: Monster, pending: string | null): void {
    const wanted = new Set<string>();
    for (const slot of block.querySelectorAll<HTMLElement>("[data-island]")) {
      const name = slot.dataset.island as IslandName;
      wanted.add(name);
      let host = this.islands.get(name);
      if (!host) {
        host = document.createElement("span");
        this.islands.set(name, host);
      }
      slot.replaceWith(host);
      render(this.island(name, monster, pending), host);
    }
    // A field the creature no longer shows: unmount it and forget the host.
    for (const [name, host] of this.islands) {
      if (wanted.has(name)) continue;
      render(null, host);
      this.islands.delete(name);
    }
  }

  /** What each island holds. */
  private island(name: IslandName, monster: Monster, pending: string | null) {
    switch (name) {
      case "gear":
      case "languages":
        return (
          <TextRow
            field={name}
            value={monster[name]}
            label={name === "gear" ? "Gear" : "Languages"}
            placeholder={name === "gear" ? "gear…" : "languages…"}
            onCommit={(field, value) =>
              field === "gear" ? this.editing.setGear(value) : this.editing.setLanguages(value)
            }
            onClear={(field) => this.clearTextField(field, monster)}
          />
        );
      case "savingThrows":
        return (
          <SavingThrowsRow
            monster={monster}
            adapter={this.editing}
            autoOpen={pending === "add:savingThrows"}
          />
        );
      case "damageVulnerabilities":
      case "damageResistances":
      case "damageImmunities":
      case "conditionImmunities":
      case "immunities":
        return (
          <AdjustmentsRow
            monster={monster}
            field={name}
            adapter={this.editing}
            autoOpen={pending === `add:${name}`}
          />
        );
      case "meta":
        return (
          <MetaLine
            monster={monster}
            shown={visibleMeta(monster, this.store.getSession().revealed)}
            adapter={this.editing}
            pendingFocus={pending}
          />
        );
      case "movements":
        return (
          <SpeedRow
            monster={monster}
            adapter={this.editing}
            onError={(error) => console.error("[microbrewery] movement update failed", error)}
          />
        );
      case "senses":
        return (
          <SensesRow
            monster={monster}
            adapter={this.editing}
            autoOpen={pending === "add:senses"}
            onError={(error) => console.error("[microbrewery] sense update failed", error)}
          />
        );
      case "skills":
        return (
          <SkillsRow
            monster={monster}
            adapter={this.editing}
            autoOpen={pending === "add:skills"}
            onError={(error) => console.error("[microbrewery] skill update failed", error)}
          />
        );
      default:
        return null;
    }
  }

  /**
   * The ✕ on a text row drops the value *and* the row. Clearing a field that
   * was only ever revealed writes nothing — there is nothing in the form to
   * clear — so the session update is what repaints.
   */
  private clearTextField(field: "gear" | "languages", monster: Monster): void {
    this.store.update({ revealed: unreveal(this.store.getSession(), field) });
    if (monster[field] === "") return;
    if (field === "gear") this.editing.setGear("");
    else this.editing.setLanguages("");
  }

  /**
   * Makes the Traits section editable: swaps its read-only body for a persistent
   * Lexical editor host. The host and editor are created once and re-parented
   * into each freshly rendered block, so form-driven re-renders never tear the
   * editor down. When the section is present but unfocused, its content is
   * re-synced from the form; the focus guard in render() covers the focused case.
   *
   * This is the narrow proof of the editable-prose architecture; the remaining
   * sections and the lit-html view conversion build on the same seam.
   */
  private mountTraitsEditor(block: ParentNode, monster: Monster): void {
    const holder = block.querySelector<HTMLElement>('[data-section="traits"]');
    if (!holder) return; // no traits body to edit (empty section)
    const initialHtml = monster.descriptionHtml?.traits ?? "";

    if (!this.traitsEditor || !this.traitsHost) {
      this.traitsHost = document.createElement("div");
      this.traitsHost.className = "sb-prose";
      holder.replaceChildren(this.traitsHost);
      this.traitsEditor = new ProseEditor({
        section: "traits",
        initialHtml,
        onCommit: (section, html) => {
          this.editing.setDescription(section, html);
        },
      });
      this.traitsEditor.mount(this.traitsHost);
      return;
    }

    // Reuse the existing editor: re-parent its host into the new block. Only
    // re-sync content when the user isn't mid-edit (they aren't — render() bails
    // early while focused).
    holder.replaceChildren(this.traitsHost);
    this.traitsEditor.setContent(initialHtml);
  }

  private destroyMenus(): void {
    for (const menu of this.menus) menu.destroy();
    this.menus = [];
  }

  /** Holds on to a mini-form's teardown; the closed chips return nothing. */
  private keepForm(teardown: (() => void) | void): void {
    if (teardown) this.formTeardowns.push(teardown);
  }

  private destroyForms(): void {
    for (const teardown of this.formTeardowns) teardown();
    this.formTeardowns = [];
  }

  /**
   * Opens the picker a just-revealed field wants the user in, if that's what it
   * has — adding a row from "Add…" is always a prelude to filling it in, and a
   * closed dropdown would just cost another click. Answers whether it did.
   *
   * Only ever called with a `pending` key: a picker whose trigger happened to
   * hold focus through an ordinary re-render must stay shut.
   */
  private openPending(pending: string | null): boolean {
    if (!pending) return false;
    const picker = this.menus.find(
      (menu): menu is OptionPicker => menu instanceof OptionPicker && menu.focusKey === pending,
    );
    picker?.open();
    return picker !== undefined;
  }

  /**
   * Whether the caret is in a chip picker's filter box. A class rather than a
   * `data-focus-key` because several pickers can be in the block at once, which
   * would leave `restoreFocus` no way to tell which one to go back to.
   */
  private filteringPicker(): boolean {
    const active = this.shadow.activeElement as HTMLElement | null;
    return active?.classList.contains("cp-filter") ?? false;
  }

  /** The `data-focus-key` of the field that currently holds focus, if any. */
  private focusedKey(): string | null {
    const active = this.shadow.activeElement as HTMLElement | null;
    return active?.dataset.focusKey ?? null;
  }

  /**
   * Puts the caret back on `key` in the freshly rendered block. `select` is for
   * a field we just created with a default in it, so typing replaces it.
   */
  private restoreFocus(scope: ParentNode, key: string | null, select = false): void {
    if (!key) return;
    const input = scope.querySelector<HTMLInputElement>(`[data-focus-key="${key}"]`);
    if (!input) return;
    input.focus();
    if (select) input.select();
  }
}
