import { type DevToolContext, type DevTransport, registeredTools } from "./bridge";

// The local drawer chrome: host element, shadow root (deck styles and Tailwind
// can never touch it), the pill, the panel tools mount into, toasts, and the
// agent-presence dot driven by transport messages. Local-only: a hosted
// dashboard renders its own UI in the parent frame.

export const HOST_ID = "lst-dev-host";

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  .pill {
    position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
    display: inline-flex; align-items: center; gap: 7px;
    background: rgba(18,18,20,.92); color: #f5f2ea; border: 1px solid rgba(255,255,255,.14);
    border-radius: 999px; padding: 8px 14px; font-size: 12.5px; letter-spacing: .02em;
    cursor: pointer; user-select: none; backdrop-filter: blur(6px);
  }
  .pill:hover { border-color: rgba(212,175,55,.55); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #666; }
  .dot[data-on="true"] { background: #58c777; box-shadow: 0 0 6px rgba(88,199,119,.8); }
  .panel {
    position: fixed; right: 14px; bottom: 56px; z-index: 2147483000; width: 300px;
    max-height: 66vh; overflow: auto; background: rgba(18,18,20,.96); color: #f5f2ea;
    border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 12px;
    font-size: 12.5px; display: none; backdrop-filter: blur(8px);
  }
  .panel[data-open="true"] { display: block; }
  .hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .hdr b { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #d4af37; }
  .hint { color: #9a958a; font-size: 11.5px; margin: 6px 0; line-height: 1.45; }
  button.act {
    background: rgba(255,255,255,.08); color: inherit; border: 1px solid rgba(255,255,255,.16);
    border-radius: 7px; padding: 6px 10px; font-size: 12px; cursor: pointer; margin: 2px 4px 2px 0;
  }
  button.act:hover { border-color: rgba(212,175,55,.55); }
  button.act[data-active="true"] { background: rgba(212,175,55,.2); border-color: #d4af37; }
  button.act.primary { background: #d4af37; color: #1a1a1c; font-weight: 600; }
  button.act:disabled { opacity: .45; cursor: not-allowed; }
  .entry { border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 7px 9px; margin: 6px 0; }
  .entry .meta { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .chip { font-size: 10px; padding: 1px 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); }
  .chip[data-s="open"] { color: #f0d27a; border-color: rgba(212,175,55,.5); }
  .chip[data-s="dispatched"] { color: #8db9ff; border-color: rgba(120,160,255,.5); }
  .chip[data-s="applied"] { color: #8fe3a8; border-color: rgba(88,199,119,.5); }
  .entry .txt { color: #cfcabf; margin-top: 4px; white-space: pre-wrap; }
  .x { background: none; border: none; color: #9a958a; cursor: pointer; font-size: 13px; }
  .x:hover { color: #f5f2ea; }
  .overlay { position: fixed; inset: 0; z-index: 2147482000; cursor: crosshair; display: none; touch-action: none; }
  .overlay[data-on="true"] { display: block; }
  .cbox {
    position: fixed; z-index: 2147483100; background: rgba(18,18,20,.97); border: 1px solid #d4af37;
    border-radius: 8px; padding: 6px; display: none;
  }
  .cbox input { background: rgba(255,255,255,.06); color: #f5f2ea; border: 1px solid rgba(255,255,255,.2);
    border-radius: 6px; padding: 5px 8px; font-size: 12.5px; width: 220px; outline: none; }
  .toast {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483200;
    background: rgba(18,18,20,.95); color: #f5f2ea; border: 1px solid rgba(212,175,55,.5);
    border-radius: 999px; padding: 7px 16px; font-size: 12.5px; opacity: 0; transition: opacity .18s;
    pointer-events: none; max-width: 76vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .toast[data-on="true"] { opacity: 1; }
`;

export interface Shell {
  mountTools: () => void;
  onSlideChange: () => void;
}

export function createShell(transport: DevTransport, currentSlide: () => number): Shell {
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  const pill = document.createElement("button");
  pill.className = "pill";
  const dot = document.createElement("span");
  dot.className = "dot";
  const pillLabel = document.createElement("span");
  pillLabel.textContent = "dev";
  pill.append(dot, pillLabel);
  root.appendChild(pill);

  const panel = document.createElement("div");
  panel.className = "panel";
  const hdr = document.createElement("div");
  hdr.className = "hdr";
  const title = document.createElement("b");
  title.textContent = "liebstoeckel dev";
  const agentLabel = document.createElement("span");
  agentLabel.className = "hint";
  agentLabel.textContent = "agent: offline";
  hdr.append(title, agentLabel);
  panel.appendChild(hdr);
  const toolBody = document.createElement("div");
  panel.appendChild(toolBody);
  root.appendChild(panel);

  const toastEl = document.createElement("div");
  toastEl.className = "toast";
  root.appendChild(toastEl);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const toast = (text: string) => {
    toastEl.textContent = text;
    toastEl.dataset.on = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.dataset.on = "false";
    }, 3200);
  };

  pill.addEventListener("click", () => {
    panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
  });

  let refreshFn: () => void = () => {};
  const ctx: DevToolContext = {
    transport,
    currentSlide,
    toast,
    refresh: () => refreshFn(),
  };

  transport.subscribe((msg) => {
    switch (msg.type) {
      case "connected":
      case "agent_polling":
        dot.dataset.on = String(msg.agentPolling ?? msg.connected ?? false);
        agentLabel.textContent = dot.dataset.on === "true" ? "agent: polling" : "agent: offline";
        break;
      case "batch_dispatched":
        toast(msg.agentPolling ? "Sent to agent" : "Staged: saved for the next agent session");
        refreshFn();
        break;
      case "batch_resolved": {
        const applied = (msg.applied as string[])?.length ?? 0;
        const notes = (msg.notes as string[]) ?? [];
        toast(`Agent applied ${applied} annotation(s)${notes.length ? `: ${notes[0]}` : ""}`);
        refreshFn();
        break;
      }
      case "batch_failed":
        toast(`Agent error: ${String(msg.message ?? "unknown")}`);
        refreshFn();
        break;
      case "batch_reverted":
        toast("Batch reverted");
        refreshFn();
        break;
      case "annotation_updated":
        refreshFn();
        break;
      case "exit":
        toast("Dev server stopped");
        dot.dataset.on = "false";
        break;
    }
  });

  return {
    mountTools: () => {
      // v1 hosts a single tool; the registry keeps the seam for more.
      const tool = registeredTools()[0];
      if (!tool) return;
      tool.mount(toolBody, ctx);
      refreshFn = () => (toolBody.dispatchEvent(new CustomEvent("lst-refresh")), undefined);
      refreshFn();
    },
    onSlideChange: () => refreshFn(),
  };
}
