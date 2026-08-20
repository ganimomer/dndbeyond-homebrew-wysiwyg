/**
 * The full-page editor overlay. Opened from the launcher, it covers the D&D
 * Beyond homebrew form with a stat block that looks like the monster outside
 * edit mode (artwork + all sections), and carries an Encounters-style context
 * menu on the name row for switching ruleset or closing back to the form.
 *
 * Everything lives in one shadow root so DDB's page styles can't leak in.
 */
import type { PageAdapter } from "../adapter/types.js";
import type { Ability, Monster } from "../statblock/model.js";
import { renderStatBlock } from "../preview/statblock-view.js";
import { basicsFields, hiddenFields, type OptionalField } from "../preview/optional-fields.js";
import { unarmoredAc } from "../statblock/armor-class.js";
import { saveSlot } from "../preview/dom.js";
import { ContextMenu, makeIcon } from "./context-menu.js";
import { applyDependencyHighlights, wireAbilityInputs } from "./ability-editing.js";
import { wireHitPoints, type HitPointsEditing } from "./hit-points-editing.js";
import { wireArmorClass, type ArmorClassEditing } from "./armor-class-editing.js";
import { wireMetaControls } from "./meta-editing.js";
import { wireSkills } from "./skills-editing.js";
import { wireSavingThrows } from "./saves-editing.js";
import { wireMovements } from "./speed-editing.js";
import { wireAdjustments } from "./adjustments-editing.js";
import { wireSenses } from "./senses-editing.js";
import { wireTextFields } from "./text-field-editing.js";
import { ProseEditor } from "./prose-editor.js";
import { AutosaveController } from "./autosave.js";
import { applySaveState, HEADER_ORIGIN } from "./save-indicator.js";
import { wireName } from "./name-editing.js";
import { revealFocusKey, wireAddField } from "./field-visibility.js";
import { NAME_FOCUS_KEY } from "../preview/name-row.js";
import panelCss from "./panel.css";
import contextMenuCss from "./context-menu.css";
import chipPickerCss from "./chip-picker.css";
import statblock5eCss from "../preview/statblock-5e.css";
import statblock55eCss from "../preview/statblock-55e.css";

const HOST_ID = "microbrewery-panel-host";

export interface EditorPanelOptions {
  /** Called when the user closes the overlay (to restore the launcher). */
  onClose?: () => void;
}

export class EditorPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private stage!: HTMLElement;
  private unobserve: (() => void) | null = null;
  private rafToken = 0;
  /**
   * Popovers mounted into the current block: the name-row kebab and the "Add…"
   * footer are `ContextMenu`s, every chip row's "＋" a `ChipPicker`. Only the
   * teardown is shared, so that is all this holds them by.
   */
  private menus: { destroy(): void }[] = [];
  /**
   * Click-away listeners belonging to the mini-forms in the current block. They
   * live on `window`, outside the block that gets thrown away, so each render
   * detaches the last one's before the fresh form registers its own.
   */
  private formTeardowns: (() => void)[] = [];
  /**
   * A `data-focus-key` to focus once, on the next render — set when we add a
   * field the user is expected to type into straight away (a new movement's
   * speed), since the write-back re-renders the whole block underneath them.
   */
  private pendingFocus: string | null = null;
  /** Abilities the user has edited this session; drives dependency highlights. */
  private changedAbilities = new Set<Ability>();
  /**
   * Optional fields the user added from the "Add…" menu that have nothing in
   * them yet — the stat block prints only the rows a creature actually has, so
   * these are the exception that keeps an empty row on screen to be filled in.
   * Session-only: nothing about it reaches D&D Beyond, and a field drops out of
   * the set the moment it has a value of its own (see `pruneRevealed`).
   */
  private revealed = new Set<OptionalField>();
  /**
   * The open hit-points form, or null while it's a chip. The block is rebuilt on
   * every form mutation, so the half-typed draft can't live in the DOM — it's
   * held here and handed back to `wireHitPoints` on each render.
   */
  private hpEditing: HitPointsEditing | null = null;
  /** The open armor-class form, or null while it's a chip. */
  private acEditing: ArmorClassEditing | null = null;
  /**
   * What the creature's armor is worth over its unarmored class. Read once from
   * the pristine form and re-read whenever the user sets an armor class, so it
   * always holds the last figure they actually stood behind — which is what a
   * Dexterity change is measured against.
   */
  private armorBonus: number | null = null;
  /**
   * The live editor for the Traits section (the first prose section wired for
   * editing). Persists across re-renders — its host is re-parented into each
   * freshly rendered block rather than rebuilt, so the caret and undo survive.
   */
  private traitsEditor: ProseEditor | null = null;
  private traitsHost: HTMLElement | null = null;
  /** Debounces edits into whole-form saves and tracks who's waiting. */
  private readonly autosave: AutosaveController;
  private unsubscribeSave: (() => void) | null = null;
  /**
   * Best-effort flush when the tab goes away mid-debounce. The save is far too
   * large for `keepalive`, so an immediate unload can still cut it off — but DDB
   * puts up its own unsaved-changes prompt, which usually buys enough time.
   */
  private readonly onBeforeUnload = () => {
    void this.autosave.flush();
  };

  constructor(
    private readonly adapter: PageAdapter,
    private readonly options: EditorPanelOptions = {},
  ) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.autosave = new AutosaveController(() => this.adapter.save());
    this.build();
  }

  /** Mounts the overlay and starts tracking the form. */
  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
    // Freeze the page underneath so only the overlay scrolls.
    document.documentElement.style.overflow = "hidden";
    this.render();
    this.unobserve = this.adapter.observe(() => this.scheduleRender());
    // Save state changes on its own schedule — a request starting or finishing
    // doesn't touch the form — so it repaints the indicators directly rather
    // than waiting for a render.
    this.unsubscribeSave = this.autosave.onStateChange((state) =>
      applySaveState(this.stage, state, () => this.autosave.retry()),
    );
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  /** Removes the overlay and stops tracking. */
  unmount(): void {
    this.unobserve?.();
    this.unobserve = null;
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.unsubscribeSave?.();
    this.unsubscribeSave = null;
    // Persist anything still inside the debounce window before we let go. The
    // form keeps the edits either way, but this is what makes closing the
    // overlay feel like it committed them.
    void this.autosave.flush().then(() => this.autosave.destroy());
    this.destroyMenus();
    this.destroyForms();
    this.traitsEditor?.destroy();
    this.traitsEditor = null;
    this.traitsHost = null;
    document.documentElement.style.overflow = "";
    this.host.remove();
  }

  private close(): void {
    this.unmount();
    this.options.onClose?.();
  }

  private build(): void {
    const style = document.createElement("style");
    style.textContent = [
      panelCss,
      contextMenuCss,
      chipPickerCss,
      statblock5eCss,
      statblock55eCss,
    ].join("\n");
    this.root.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const page = document.createElement("div");
    page.className = "page";
    this.stage = document.createElement("div");
    this.stage.className = "stage";
    page.appendChild(this.stage);
    overlay.appendChild(page);
    this.root.appendChild(overlay);
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

    const monster = this.adapter.read();
    if (!monster) return;

    this.pruneRevealed(monster);
    this.destroyMenus();
    this.destroyForms();
    const block = renderStatBlock(monster, { revealed: this.revealed });

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
            this.adapter.setRuleset(other);
            this.autosave.request(HEADER_ORIGIN);
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
      this.changedAbilities.add(ability);
      this.adapter.setAbility(ability, score);
      this.autosave.request(HEADER_ORIGIN);
    });
    applyDependencyHighlights(block, this.changedAbilities);

    // Armor class is one stored number the form splits into "what Dexterity
    // gives you" and "what your armor adds". Remember the armor's worth from
    // the pristine form so a later DEX edit has something to preserve.
    this.armorBonus ??= monster.armorClass.value - unarmoredAc(monster);
    this.keepForm(
      wireArmorClass(block, monster, {
        state: this.acEditing,
        dexChanged: this.changedAbilities.has("dex"),
        armorBonus: this.armorBonus,
        onOpen: () => {
          this.acEditing = { draft: { ...monster.armorClass } };
          this.pendingFocus = "ac:bonus";
          this.render();
        },
        onChange: (draft) => {
          if (this.acEditing) this.acEditing.draft = draft;
        },
        onCommit: (armorClass) => {
          this.acEditing = null;
          // Re-anchor against the Dexterity in force now: the user has reconciled
          // the two, so this is the bonus a *future* DEX edit should preserve.
          this.armorBonus = armorClass.value - unarmoredAc(monster);
          this.adapter.setArmorClass(armorClass);
          this.autosave.request(HEADER_ORIGIN);
        },
        onCancel: () => {
          this.acEditing = null;
          this.render();
        },
      }),
    );

    // Hit points are four fields behind one chip. Opening and cancelling only
    // change our own state — nothing writes to the form, so `observe()` won't
    // fire and we re-render by hand; committing writes and rides autosave.
    this.keepForm(
      wireHitPoints(block, monster, {
        state: this.hpEditing,
        conChanged: this.changedAbilities.has("con"),
        dieOptions: () => this.adapter.hitDieOptions(),
        onOpen: () => {
          this.hpEditing = { draft: { ...monster.hitPoints }, baseline: { ...monster.hitPoints } };
          this.pendingFocus = "hp:average";
          this.render();
        },
        onChange: (draft) => {
          if (this.hpEditing) this.hpEditing.draft = draft;
        },
        onCommit: (hitPoints) => {
          this.hpEditing = null;
          this.adapter.setHitPoints(hitPoints);
          this.autosave.request(HEADER_ORIGIN);
        },
        onCancel: () => {
          this.hpEditing = null;
          this.render();
        },
      }),
    );

    // The creature name is a contenteditable in the header row; it commits on
    // blur or Enter, and rides autosave like the rest of the header.
    wireName(block, monster, {
      onCommit: (name) => {
        this.adapter.setName(name);
        this.autosave.request(HEADER_ORIGIN);
      },
    });

    // Size/type/alignment dropdowns + the subtype tag editor in the meta line all
    // write back to ordinary form fields, so they ride autosave.
    wireMetaControls(block, {
      sizeOptions: () => this.adapter.sizeOptions(),
      typeOptions: () => this.adapter.typeOptions(),
      subTypeOptions: () => this.adapter.subTypeOptions(),
      alignmentOptions: () => this.adapter.alignmentOptions(),
      setSize: (value) => {
        this.adapter.setSize(value);
        this.autosave.request(HEADER_ORIGIN);
      },
      setType: (value) => {
        this.adapter.setType(value);
        this.autosave.request(HEADER_ORIGIN);
      },
      setSubTypes: (values) => {
        this.adapter.setSubTypes(values);
        this.autosave.request(HEADER_ORIGIN);
      },
      setAlignment: (value) => {
        this.adapter.setAlignment(value);
        this.autosave.request(HEADER_ORIGIN);
      },
    });

    // Saving throws are one multi-select in the form, so they ride autosave
    // like the rest — chips in 5e, proficiency dots in the 5.5e Save column.
    this.menus.push(
      ...wireSavingThrows(block, monster, {
        savingThrowOptions: () => this.adapter.savingThrowOptions(),
        setSavingThrows: (values) => {
          this.adapter.setSavingThrows(values);
          this.autosave.request(HEADER_ORIGIN);
        },
      }),
    );

    // Damage adjustments and condition immunities are multi-selects on the form,
    // so they commit whole and ride autosave like the saving throws.
    this.menus.push(
      ...wireAdjustments(block, this.adapter, () => this.autosave.request(HEADER_ORIGIN)),
    );

    // Gear and the languages note are plain form fields. Clearing one empties
    // the field *and* takes the row off the block.
    wireTextFields(block, monster, {
      onCommit: (field, value) => {
        if (field === "gear") this.adapter.setGear(value);
        else this.adapter.setLanguages(value);
        this.autosave.request(HEADER_ORIGIN);
      },
      onClear: (field) => {
        this.revealed.delete(field);
        if (monster[field] === "") {
          // Nothing to write — it was an empty row the user changed their mind
          // about, so no form mutation will come back to re-render us.
          this.render();
          return;
        }
        if (field === "gear") this.adapter.setGear("");
        else this.adapter.setLanguages("");
        this.autosave.request(HEADER_ORIGIN);
      },
    });

    // Skills and movements are the edits that don't go through autosave: DDB
    // keeps them as separate records, so the adapter persists each change
    // itself and updates the listing table, which re-renders us via observe().
    this.menus.push(
      ...wireSkills(block, monster, this.adapter, (error) => {
        console.error("[microbrewery] skill update failed", error);
      }),
      ...wireMovements(block, monster, this.adapter, {
        // The chip doesn't exist yet — queue its input for the render that the
        // write-back triggers, so the default is selected and ready to type over.
        onAdd: (type) => {
          this.pendingFocus = `speed:${type}`;
        },
        onError: (error) => console.error("[microbrewery] movement update failed", error),
      }),
      // Senses are listing records too; passive Perception, sharing the row, is
      // an ordinary field and rides autosave instead.
      ...wireSenses(block, monster, this.adapter, {
        onAdd: (type) => {
          this.pendingFocus = `sense:${type}`;
        },
        onPassivePerception: () => this.autosave.request(HEADER_ORIGIN),
        onError: (error) => console.error("[microbrewery] sense update failed", error),
      }),
    );

    // The "Add…" menu at the foot of the section. Revealing a field changes
    // nothing in the form, so `observe()` won't fire — re-render by hand.
    this.menus.push(
      ...wireAddField(block, hiddenFields(monster, this.revealed, monster.ruleset), (key) => {
        this.revealed.add(key);
        this.pendingFocus = revealFocusKey(key);
        this.render();
      }),
    );

    // Preserve caret focus across the blur→re-render so tabbing between inputs
    // stays usable. A field we just added (pendingFocus) wins, and gets its
    // default value selected so the user can type straight over it.
    const pending = this.pendingFocus;
    this.pendingFocus = null;
    const focusKey = pending ?? this.focusedKey();
    this.stage.replaceChildren(block);
    this.restoreFocus(block, focusKey, pending !== null);

    // Mount after the block is attached so Lexical binds to a connected node.
    this.mountTraitsEditor(block, monster);

    // The block is brand new, so any in-progress save needs re-painting onto it.
    applySaveState(this.stage, this.autosave.state, () => this.autosave.retry());
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
          this.adapter.setDescription(section, html);
          this.autosave.request(section);
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

  /**
   * Forgets the reveal of any field that now has a value: it renders on its own
   * merit from here on, so when its last value is removed the row goes away
   * rather than lingering as an empty one.
   */
  private pruneRevealed(monster: Monster): void {
    for (const spec of basicsFields(monster.ruleset)) {
      if (spec.hasValue(monster)) this.revealed.delete(spec.key);
    }
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
   * Whether the caret is in a chip picker's filter box. A class rather than a
   * `data-focus-key` because several pickers can be in the block at once, which
   * would leave `restoreFocus` no way to tell which one to go back to.
   */
  private filteringPicker(): boolean {
    const active = this.root.activeElement as HTMLElement | null;
    return active?.classList.contains("cp-filter") ?? false;
  }

  /** The `data-focus-key` of the field that currently holds focus, if any. */
  private focusedKey(): string | null {
    const active = this.root.activeElement as HTMLElement | null;
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
