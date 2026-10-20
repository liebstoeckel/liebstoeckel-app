// The dev server's error overlay: a custom element with an open shadow root, so
// the deck's styles do not reach it and tooling can still read it. `data-error`
// carries the problems as plain text (the hosted preview's cues read it). All text
// goes in through textContent, never as markup.

export interface OverlayError {
  text: string;
  file?: string;
  line?: number;
  column?: number;
}

const TAG = "lst-dev-overlay";

const STYLE = `
:host { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: flex-start; justify-content: center;
  background: rgba(10, 12, 9, 0.72); font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #eef0e8; }
.box { margin-top: 8vh; max-width: min(960px, 92vw); max-height: 80vh; overflow: auto; background: #161a13;
  border: 1px solid #c8a96a; border-radius: 10px; padding: 20px 24px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
h1 { margin: 0 0 4px; font: 600 16px/1.3 system-ui, sans-serif; color: #f0c674; }
p.hint { margin: 0 0 16px; font: 13px/1.4 system-ui, sans-serif; color: #a9ad9f; }
.item { margin: 0 0 14px; }
.where { color: #8fbcbb; }
pre { margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; }
button { float: right; background: none; border: 1px solid #555a4d; color: #eef0e8; border-radius: 6px; padding: 2px 10px; cursor: pointer; font: inherit; }
`;

export function describe(e: OverlayError): string {
  const where = e.file ? `${e.file}${e.line ? `:${e.line}${e.column ? `:${e.column}` : ""}` : ""}` : "";
  return where ? `${where}: ${e.text}` : e.text;
}

export class ErrorOverlay {
  private el: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private delayMs: number) {}

  show(errors: OverlayError[]): void {
    if (errors.length === 0) return this.hide();
    if (this.timer) clearTimeout(this.timer);
    const render = () => {
      this.timer = null;
      if (!this.el) {
        if (!customElements.get(TAG)) customElements.define(TAG, class extends HTMLElement {});
        this.el = document.createElement(TAG);
        this.el.attachShadow({ mode: "open" });
        document.documentElement.appendChild(this.el);
      }
      const root = this.el.shadowRoot!;
      root.replaceChildren();
      const style = document.createElement("style");
      style.textContent = STYLE;
      const box = document.createElement("div");
      box.className = "box";
      const close = document.createElement("button");
      close.textContent = "Dismiss";
      close.onclick = () => this.hide();
      const h = document.createElement("h1");
      h.textContent = errors.length === 1 ? "The deck does not build" : `The deck does not build (${errors.length} problems)`;
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Fix the file and save: the deck updates by itself.";
      box.append(close, h, hint);
      for (const e of errors) {
        const item = document.createElement("div");
        item.className = "item";
        if (e.file) {
          const where = document.createElement("div");
          where.className = "where";
          where.textContent = describe({ ...e, text: "" }).replace(/: $/, "");
          item.append(where);
        }
        const pre = document.createElement("pre");
        pre.textContent = e.text;
        item.append(pre);
        box.append(item);
      }
      root.append(style, box);
      this.el.setAttribute("data-error", errors.map(describe).join("\n"));
    };
    if (this.delayMs > 0 && !this.el) this.timer = setTimeout(render, this.delayMs);
    else render();
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.el?.remove();
    this.el = null;
  }
}
