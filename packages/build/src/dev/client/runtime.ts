// The dev runtime in the deck page (served at <base>/@lst/runtime.js, loaded
// before the deck's own modules). It provides the `import.meta.hot` today's decks
// use (`data` survives a re-import, `accept()` marks a boundary), React Fast
// Refresh through react-refresh's runtime, stylesheet updates, the change channel
// (a WebSocket to the dev server) and the error overlay.
import RefreshRuntime from "react-refresh/runtime";
import { ErrorOverlay, type OverlayError } from "./overlay.ts";

interface Config {
  base: string;
  /** Wait this long before showing a build error (the hosted editor sends every
   *  keystroke, so half-typed code should not flash the overlay). */
  overlayDelayMs?: number;
}

const config: Config = (globalThis as { __LIEBSTOECKEL_DEV_SERVER__?: Config }).__LIEBSTOECKEL_DEV_SERVER__ ?? { base: "" };

// Before React loads: react-dom picks up the refresh hook when it initializes.
RefreshRuntime.injectIntoGlobalHook(window);
(window as unknown as { $RefreshReg$: () => void }).$RefreshReg$ = () => {};
(window as unknown as { $RefreshSig$: () => (t: unknown) => unknown }).$RefreshSig$ = () => (t) => t;

interface HotStore {
  data: Record<string, Record<string, unknown>>;
  disposers: Map<string, Array<(data: Record<string, unknown>) => void>>;
}

const g = globalThis as unknown as { __lstHot?: HotStore };
const store: HotStore = (g.__lstHot ??= { data: {}, disposers: new Map() });

export function createHot(id: string) {
  // A module running again (a hot update re-imports its boundary): the modules it
  // imports have run and registered their components by now. Refresh before its
  // body renders, so React sees the new components as the same families and keeps
  // their state instead of remounting them.
  if (store.data[id]) refresh.now();
  const data = (store.data[id] ??= {});
  return {
    data,
    accept(_cb?: unknown) {},
    decline() {},
    dispose(cb: (data: Record<string, unknown>) => void) {
      const list = store.disposers.get(id) ?? [];
      list.push(cb);
      store.disposers.set(id, list);
    },
    invalidate() {
      location.reload();
    },
    on() {},
    off() {},
  };
}

/** Insert or replace a stylesheet by id (stylesheet modules call this). */
export function style(id: string, css: string): void {
  let el = [...document.querySelectorAll<HTMLStyleElement>("style[data-lst-css]")].find((s) => s.dataset.lstCss === id) ?? null;
  if (!el) {
    el = document.createElement("style");
    el.dataset.lstCss = id;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** What the dev transform appends to a module that defines components. */
export const refresh = {
  register(type: unknown, id: string, signature: string): void {
    if (typeof type !== "function" && (typeof type !== "object" || type === null)) return;
    RefreshRuntime.register(type, id);
    RefreshRuntime.setSignature(type, signature, false);
  },
  /** Swap the registered components that changed, right away. */
  now(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    RefreshRuntime.performReactRefresh();
  },
  /** Swap the registered components that changed, keeping their state. */
  perform(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      RefreshRuntime.performReactRefresh();
    }, 0);
  },
};

const overlay = new ErrorOverlay(config.overlayDelayMs ?? 0);

type Message =
  | { type: "update"; boundaries: string[] }
  | { type: "css"; id: string; text: string }
  | { type: "reload"; reason: string }
  | { type: "error"; errors: OverlayError[] }
  | { type: "ok" };

async function apply(m: Message): Promise<void> {
  if (m.type === "css") return style(m.id, m.text);
  if (m.type === "reload") return location.reload();
  if (m.type === "error") return overlay.show(m.errors);
  if (m.type === "ok") return overlay.hide();
  if (m.type === "update") {
    try {
      for (const url of m.boundaries) {
        const id = decodeURI(new URL(url, location.href).pathname.slice(`${config.base}/@fs`.length));
        const disposers = store.disposers.get(id) ?? [];
        store.disposers.delete(id);
        for (const cb of disposers) cb((store.data[id] ??= {}));
        await import(/* @vite-ignore */ url);
      }
      refresh.now();
    } catch (err) {
      // The new code threw while it ran: show it; the next good edit recovers.
      console.error("[liebstoeckel] the hot update failed", err);
      overlay.show([{ text: `The update failed while it ran: ${err instanceof Error ? err.message : String(err)}` }]);
    }
  }
}

// One message at a time, in order: an update must not overtake the one before.
let chain: Promise<void> = Promise.resolve();
let connectedOnce = false;
let retry = 500;

function connect(): void {
  const url = new URL(`${config.base}/@lst/hmr`, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(url);
  ws.onopen = () => {
    // A reconnect means the server restarted: what the page runs may be stale.
    if (connectedOnce) return location.reload();
    connectedOnce = true;
    retry = 500;
  };
  ws.onmessage = (e) => {
    let m: Message;
    try {
      m = JSON.parse(String(e.data)) as Message;
    } catch {
      return;
    }
    // A stylesheet applies on arrival, not behind a hot update still importing its
    // modules: the update's new classes then find their rules already in place.
    if (m.type === "css") return style(m.id, m.text);
    chain = chain.then(() => apply(m));
  };
  ws.onclose = () => {
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 5000);
  };
}

connect();
