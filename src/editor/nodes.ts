/**
 * Custom Lexical nodes for D&D Beyond's two inline tokens: rolls and
 * references. They are `TextNode` subclasses — editable text that additionally
 * carries the token's payload (a roll's JSON, a reference's type/slug) so it
 * survives the editor untouched and can be re-encoded to DDB macros on
 * write-back.
 *
 * For now they only *style* their text (the `.roll` / `.ref` classes the
 * stat-block CSS already knows) and preserve the payload. They are the seam
 * where later features hang: clickable rolls, hover tooltips over the token, and
 * command-palette insertion all become behavior on these node types without
 * touching the codec or the renderers.
 */
import {
  TextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";

type SerializedRollNode = Spread<{ roll?: string }, SerializedTextNode>;
type SerializedRefNode = Spread<{ ref: string; slug?: string }, SerializedTextNode>;

/** A `[rollable]display;{json}[/rollable]` token; `__roll` holds the raw JSON. */
export class RollNode extends TextNode {
  __roll?: string;

  constructor(text: string, roll?: string, key?: NodeKey) {
    super(text, key);
    this.__roll = roll;
  }

  static getType(): string {
    return "ddb-roll";
  }

  static clone(node: RollNode): RollNode {
    return new RollNode(node.__text, node.__roll, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("roll");
    if (this.__roll) dom.setAttribute("data-roll", this.__roll);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    dom.classList.add("roll");
    if (this.__roll) dom.setAttribute("data-roll", this.__roll);
    else dom.removeAttribute("data-roll");
    return updated;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.className = "roll";
    if (this.__roll) element.setAttribute("data-roll", this.__roll);
    element.textContent = this.__text;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) =>
        node.classList.contains("roll")
          ? { conversion: convertRollSpan, priority: 2 }
          : null,
    };
  }

  static importJSON(json: SerializedRollNode): RollNode {
    const node = new RollNode(json.text, json.roll);
    node.setFormat(json.format);
    node.setDetail(json.detail);
    node.setMode(json.mode);
    node.setStyle(json.style);
    return node;
  }

  exportJSON(): SerializedRollNode {
    return { ...super.exportJSON(), type: "ddb-roll", roll: this.__roll };
  }
}

/** A `[type]slug;display[/type]` reference; `__ref` is the type, `__slug` the target. */
export class RefNode extends TextNode {
  __ref: string;
  __slug?: string;

  constructor(text: string, ref: string, slug?: string, key?: NodeKey) {
    super(text, key);
    this.__ref = ref;
    this.__slug = slug;
  }

  static getType(): string {
    return "ddb-ref";
  }

  static clone(node: RefNode): RefNode {
    return new RefNode(node.__text, node.__ref, node.__slug, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("ref");
    dom.setAttribute("data-ref", this.__ref);
    if (this.__slug) dom.setAttribute("data-slug", this.__slug);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    dom.classList.add("ref");
    dom.setAttribute("data-ref", this.__ref);
    if (this.__slug) dom.setAttribute("data-slug", this.__slug);
    else dom.removeAttribute("data-slug");
    return updated;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.className = "ref";
    element.setAttribute("data-ref", this.__ref);
    if (this.__slug) element.setAttribute("data-slug", this.__slug);
    element.textContent = this.__text;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) =>
        node.classList.contains("ref")
          ? { conversion: convertRefSpan, priority: 2 }
          : null,
    };
  }

  static importJSON(json: SerializedRefNode): RefNode {
    const node = new RefNode(json.text, json.ref, json.slug);
    node.setFormat(json.format);
    node.setDetail(json.detail);
    node.setMode(json.mode);
    node.setStyle(json.style);
    return node;
  }

  exportJSON(): SerializedRefNode {
    return { ...super.exportJSON(), type: "ddb-ref", ref: this.__ref, slug: this.__slug };
  }
}

function convertRollSpan(node: HTMLElement): DOMConversionOutput {
  return { node: new RollNode(node.textContent ?? "", node.getAttribute("data-roll") ?? undefined) };
}

function convertRefSpan(node: HTMLElement): DOMConversionOutput {
  return {
    node: new RefNode(
      node.textContent ?? "",
      node.getAttribute("data-ref") ?? "",
      node.getAttribute("data-slug") ?? undefined,
    ),
  };
}

/** All custom nodes, for registering with the editor. */
export const DDB_NODES: Array<typeof LexicalNode> = [RollNode, RefNode] as Array<
  typeof LexicalNode
>;
