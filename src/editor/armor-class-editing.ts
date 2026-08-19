/**
 * Makes the armor class editable: the closed chip opens a form that shows the
 * number the way it was actually arrived at —
 *
 *     [ 14 + ] 2  =  [16]  ( [natural armor] )
 *
 * — with the unarmored part (`10 + DEX mod`) as a readonly prefix, the armor's
 * contribution beside it, and the total after the equals sign.
 *
 * The bonus and the total are two views of one stored number, so they're linked
 * both ways and rewrite each other on the spot. That's the opposite of the
 * hit-points form's hint chips, and deliberately so: there the fields are
 * *related but independent* values D&D Beyond stores separately, while here
 * there is only ever one number — the split is a lens on it, not a second fact
 * that could disagree.
 *
 * The one hint is on the total, and only after a Dexterity change: the panel
 * remembers what the armor was worth beforehand and offers the class that keeps
 * it worth that, since otherwise a DEX bump quietly reinterprets the creature's
 * armor as being worth less.
 */
import type { ArmorClass, Monster } from "../statblock/model.js";
import { armorBonus, unarmoredAc } from "../statblock/armor-class.js";
import { el } from "../preview/dom.js";
import { hintChip, iconButton, toInt } from "./mini-form.js";

/** The open form's state, owned by the panel so it survives a re-render. */
export interface ArmorClassEditing {
  /** What the fields currently hold — not yet written to the form. */
  draft: ArmorClass;
}

export interface ArmorClassHandlers {
  /** The open form's state, or null while the chip is closed. */
  state: ArmorClassEditing | null;
  /** Whether Dexterity has been edited this session. */
  dexChanged: boolean;
  /**
   * What the creature's armor was worth before this session's Dexterity edits,
   * or null when the panel hasn't got a reading yet.
   */
  armorBonus: number | null;
  onOpen(): void;
  /** Fired on every keystroke, so the panel can hold the draft. */
  onChange(draft: ArmorClass): void;
  onCommit(armorClass: ArmorClass): void;
  onCancel(): void;
}

/** The name the hint chip announces itself under. */
const HINT = "armor class";

export function wireArmorClass(
  scope: ParentNode,
  monster: Monster,
  handlers: ArmorClassHandlers,
): void {
  const wrap = scope.querySelector<HTMLElement>('.sb-chips[data-field="armorClass"]');
  if (!wrap) return;

  if (!handlers.state) {
    wrap.querySelector<HTMLButtonElement>(".sb-chip-button")
      ?.addEventListener("click", () => handlers.onOpen());
    return;
  }
  wrap.replaceChildren(buildForm(monster, handlers, handlers.state));
}

function buildForm(
  monster: Monster,
  handlers: ArmorClassHandlers,
  state: ArmorClassEditing,
): HTMLElement {
  const form = el("span", "ac-form");
  const base = unarmoredAc(monster);

  // The sign is kept apart from the magnitude rather than folded into one signed
  // number, because the operator is a field of its own on screen: at a bonus of
  // zero the form still has to remember whether it's showing "14 +" or "14 −".
  const start = armorBonus(state.draft.value, base);
  let sign: 1 | -1 = start < 0 ? -1 : 1;
  let magnitude = Math.abs(start);

  const prefix = el("span", "ac-prefix");
  const bonus = numberField("bonus", "Armor bonus");
  const bonusBox = el("span", "ac-field ac-bonus");
  bonusBox.append(prefix, bonus);

  const value = numberField("value", "Armor class");
  const valueBox = el("span", "ac-field");
  valueBox.append(value);

  const type = el("input", "ac-type");
  type.dataset.ac = "type";
  type.dataset.focusKey = "ac:type";
  type.placeholder = "armor type";
  type.value = state.draft.type;
  type.setAttribute("aria-label", "Armor type");

  form.append(bonusBox, "=", valueBox, "(", type, ")");
  form.append(
    iconButton("cancel", "close", "Discard armor-class changes", () => handlers.onCancel()),
    iconButton("commit", "check", "Apply armor class", () => handlers.onCommit(state.draft)),
  );

  /**
   * Repaints from the sign/magnitude pair, leaving `typing` alone — rewriting
   * the field the caret is in is what would make it jump.
   */
  const paint = (typing?: "bonus" | "value"): void => {
    prefix.textContent = `${base} ${sign < 0 ? "−" : "+"}`;
    const total = base + sign * magnitude;
    if (typing !== "bonus") bonus.value = String(magnitude);
    if (typing !== "value") value.value = String(total);

    state.draft = { value: total, type: type.value };
    handlers.onChange(state.draft);

    valueBox.querySelector(".sb-hint")?.remove();
    const suggested = suggestedClass(base, handlers);
    if (suggested !== undefined && suggested !== total) {
      valueBox.append(hintChip(HINT, suggested, () => setTotal(suggested)));
    }
  };

  /** Adopts a total, re-deriving how much of it the armor accounts for. */
  const setTotal = (total: number, typing?: "value"): void => {
    const next = armorBonus(total, base);
    sign = next < 0 ? -1 : 1;
    magnitude = Math.abs(next);
    paint(typing);
  };

  bonus.addEventListener("input", () => {
    const raw = bonus.value;
    magnitude = Math.abs(toInt(raw, magnitude));
    // A minus flips the operator and is absorbed: the field stays a magnitude,
    // so the form can never read "14 − -3". This is also what a number input's
    // step-down at zero produces, which is what makes that flip the prefix too.
    if (raw.includes("-")) {
      sign = sign < 0 ? 1 : -1;
      bonus.value = String(magnitude);
      paint();
      return;
    }
    paint("bonus");
  });

  // Stepping walks the *signed* bonus, so the scale stays continuous through
  // zero (…+1, 0, −1, −2…). Left to the browser it would step the magnitude,
  // which runs backwards once the operator is a minus.
  bonus.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = sign * magnitude + step;
    sign = next < 0 ? -1 : 1;
    magnitude = Math.abs(next);
    paint();
  });

  value.addEventListener("input", () => setTotal(toInt(value.value, base + sign * magnitude), "value"));
  type.addEventListener("input", () => paint());

  form.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    // Enter on a hint chip is the browser activating that button; leave it be.
    if (key === "Enter" && !(event.target as HTMLElement).closest(".sb-hint")) {
      event.preventDefault();
      handlers.onCommit(state.draft);
    } else if (key === "Escape") {
      event.preventDefault();
      handlers.onCancel();
    }
  });

  paint();
  return form;
}

/**
 * The class that would keep the armor worth what it was before this session's
 * Dexterity edits, or undefined when there's nothing to offer.
 */
function suggestedClass(base: number, { dexChanged, armorBonus }: ArmorClassHandlers): number | undefined {
  if (!dexChanged || armorBonus === null) return undefined;
  return base + armorBonus;
}

function numberField(name: "bonus" | "value", label: string): HTMLInputElement {
  const input = el("input", "ac-input");
  input.type = "number";
  input.step = "1";
  input.dataset.ac = name;
  input.dataset.focusKey = `ac:${name}`;
  input.setAttribute("aria-label", label);
  return input;
}
