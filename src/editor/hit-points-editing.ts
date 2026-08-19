/**
 * Makes the hit-points value editable: the closed chip opens a horizontal form
 * over D&D Beyond's four controls — average, die count, die value, modifier —
 * and each one that another field has invalidated grows a hint chip offering the
 * value it should now hold.
 *
 * Hints rather than rewrites, because the numbers are related but not derived:
 * plenty of stat blocks carry an average someone tuned by hand, and silently
 * recomputing it would be a data loss the author never asked for. So the rule is
 * *offer, don't apply* — nothing changes until the user takes the chip.
 *
 * A hint is only offered for a field the user hasn't reconciled themselves,
 * which is what `baseline` is for: the values as the form opened. A number that
 * still matches its baseline hasn't been touched this session, so a disagreement
 * with it is the author's business, not ours. (Constitution is edited outside
 * this form, so the panel passes `conChanged` in.)
 *
 * Like the ability scores — and unlike skills and movements — these are ordinary
 * form fields, so committing rides autosave rather than its own request.
 */
import type { SelectOption } from "../adapter/types.js";
import type { HitPoints, Monster } from "../statblock/model.js";
import { abilityModifier } from "../statblock/compute.js";
import { expectedAverage, expectedModifier } from "../statblock/hit-points.js";
import { el } from "../preview/dom.js";
import { hintChip, iconButton, toInt } from "./mini-form.js";

/** The open form's state, owned by the panel so it survives a re-render. */
export interface HitPointsEditing {
  /** What the fields currently hold — not yet written to the form. */
  draft: HitPoints;
  /** What they held when the form opened; gates which hints may appear. */
  baseline: HitPoints;
}

export interface HitPointsHandlers {
  /** The open form's state, or null while the chip is closed. */
  state: HitPointsEditing | null;
  /** Whether Constitution has been edited this session (see the module note). */
  conChanged: boolean;
  dieOptions(): SelectOption[];
  onOpen(): void;
  /** Fired on every keystroke, so the panel can hold the draft. */
  onChange(draft: HitPoints): void;
  onCommit(hitPoints: HitPoints): void;
  onCancel(): void;
}

/** The numeric fields, in the order they read and tab. */
type Field = "average" | "dieCount" | "dieValue" | "modifier";

/** Which fields are currently offering a better value, and what it is. */
export function hitPointsHints(
  { draft, baseline }: HitPointsEditing,
  conMod: number,
  conChanged: boolean,
): Partial<Record<"average" | "modifier", number>> {
  const hints: Partial<Record<"average" | "modifier", number>> = {};
  if (draft.dieCount <= 0) return hints; // no dice pool to derive anything from

  // The modifier follows Constitution, so it's stale when either side moved.
  const modifier = expectedModifier(draft, conMod);
  if (modifier !== draft.modifier && (conChanged || draft.dieCount !== baseline.dieCount)) {
    hints.modifier = modifier;
  }

  // The average follows the whole pool — including a modifier hint just taken,
  // which is what chains the two together.
  const average = expectedAverage(draft);
  const poolEdited =
    draft.dieCount !== baseline.dieCount ||
    draft.dieValue !== baseline.dieValue ||
    draft.modifier !== baseline.modifier;
  if (average !== draft.average && poolEdited) hints.average = average;

  return hints;
}

export function wireHitPoints(
  scope: ParentNode,
  monster: Monster,
  handlers: HitPointsHandlers,
): void {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="hitPoints"]');
  if (!wrap) return;

  const chip = wrap.querySelector<HTMLButtonElement>(".sb-chip-button");
  if (!handlers.state) {
    chip?.addEventListener("click", () => handlers.onOpen());
    return;
  }
  wrap.replaceChildren(buildForm(monster, handlers, handlers.state));
}

function buildForm(
  monster: Monster,
  handlers: HitPointsHandlers,
  state: HitPointsEditing,
): HTMLElement {
  const form = el("span", "hp-form");
  const conMod = abilityModifier(monster.abilities.con);

  const average = numberField("average", state.draft.average, "Average hit points");
  const dieCount = numberField("dieCount", state.draft.dieCount, "Number of Hit Dice");
  const dieValue = dieSelect(state.draft.dieValue, handlers.dieOptions());
  const modifier = numberField("modifier", state.draft.modifier, "Hit points modifier");

  // Laid out as the stat block reads it: "195 (23d8 + 92)".
  form.append(average.wrap, "(", dieCount.wrap, dieValue, modifier.wrap, ")");

  const read = (): HitPoints => ({
    average: toInt(average.input.value, state.draft.average),
    dieCount: toInt(dieCount.input.value, state.draft.dieCount),
    dieValue: selectedFaces(dieValue) ?? state.draft.dieValue,
    modifier: toInt(modifier.input.value, state.draft.modifier),
  });

  form.append(
    iconButton("cancel", "close", "Discard hit-point changes", () => handlers.onCancel()),
    iconButton("commit", "check", "Apply hit points", () => handlers.onCommit(read())),
  );

  /** Repaints the hints from the fields as they now stand. */
  const refresh = (): void => {
    state.draft = read();
    handlers.onChange(state.draft);
    const hints = hitPointsHints(state, conMod, handlers.conChanged);
    for (const [name, field] of [
      ["average", average],
      ["modifier", modifier],
    ] as const) {
      field.wrap.querySelector(".sb-hint")?.remove();
      const value = hints[name];
      if (value === undefined) continue;
      field.wrap.append(
        hintChip(name, value, () => {
          field.input.value = String(value);
          refresh();
          field.input.focus();
        }),
      );
    }
  };

  // The inputs are never rebuilt — only the hints beside them are — so typing
  // never disturbs the caret.
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  form.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    // Enter on a hint chip is the browser activating that button; leave it be.
    if (key === "Enter" && !(event.target as HTMLElement).closest(".sb-hint")) {
      event.preventDefault();
      handlers.onCommit(read());
    } else if (key === "Escape") {
      event.preventDefault();
      handlers.onCancel();
    }
  });
  refresh();
  return form;
}

/** One numeric field, in the wrapper its hint chip attaches to. */
function numberField(name: Field, value: number, label: string) {
  const wrap = el("span", "hp-field");
  const input = el("input", "hp-input");
  input.type = "number";
  input.step = "1";
  if (name !== "modifier") input.min = "0";
  input.value = String(value);
  input.dataset.hp = name;
  input.dataset.focusKey = `hp:${name}`;
  input.setAttribute("aria-label", label);
  wrap.append(input);
  return { wrap, input };
}

/** The Hit Die dropdown, filled with D&D Beyond's own options. */
function dieSelect(dieValue: number, options: SelectOption[]): HTMLSelectElement {
  const select = el("select", "hp-die");
  select.dataset.hp = "dieValue";
  select.dataset.focusKey = "hp:dieValue";
  select.setAttribute("aria-label", "Hit Die");
  for (const { value, text } of options) {
    const option = el("option");
    option.value = value;
    option.textContent = text;
    // The option's *label* is the die ("d8"); its value is DDB's own code, and
    // read() converts back through the same label.
    option.selected = text === `d${dieValue}`;
    select.append(option);
  }
  return select;
}

/**
 * The die faces the select is showing. Its *values* are D&D Beyond's own codes,
 * so the number we model comes from the label ("d8") rather than the value.
 */
function selectedFaces(select: HTMLSelectElement): number | undefined {
  const text = select.options[select.selectedIndex]?.text ?? "";
  const faces = parseInt(text.replace(/^d/i, ""), 10);
  return Number.isFinite(faces) ? faces : undefined;
}
