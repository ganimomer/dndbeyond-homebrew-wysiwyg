/**
 * The floating "Open in Microbrewery" launcher shown on the homebrew editor.
 * Clicking it opens the WYSIWYG editor panel; it hides while the panel is open.
 */
import fabCss from "./fab.css";

const HOST_ID = "microbrewery-fab-host";

export interface FabOptions {
  onOpen: () => void;
  label?: string;
}

export class Fab {
  private host: HTMLDivElement;
  private root: ShadowRoot;

  constructor(private readonly opts: FabOptions) {
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.root = this.host.attachShadow({ mode: "open" });
    this.build();
  }

  mount(): void {
    if (document.getElementById(HOST_ID)) return;
    document.body.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  private build(): void {
    const style = document.createElement("style");
    style.textContent = fabCss;
    this.root.appendChild(style);

    const button = document.createElement("button");
    button.className = "fab";
    button.type = "button";

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = "🍺";

    const label = document.createElement("span");
    label.textContent = this.opts.label ?? "Open in Microbrewery";

    button.append(icon, label);
    button.addEventListener("click", () => this.opts.onOpen());
    this.root.appendChild(button);
  }
}
