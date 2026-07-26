// A minimal Chrome DevTools Protocol driver for the headless capture loop.
//
// Why this exists: under Bun, playwright-core cannot reach Chrome on Windows.
// Its default launch transport hands the browser two extra stdio pipes (fds 3/4),
// which Bun's child_process does not deliver on Windows, and its fallback
// (connectOverCDP) upgrades an HTTP request to a WebSocket through a bundled
// copy of the `ws` package, which needs the http-upgrade support Bun's client
// lacks. Both time out. Bun's *native* WebSocket connects to Chrome fine, so on
// Windows we launch Chrome ourselves with a DevTools port and speak raw CDP
// over that socket. The surface is only what the slide drivers use.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The slice of a page the slide drivers need; implemented by the playwright
 *  adapter and the CDP driver below. */
export interface DriverPage {
  setContent(html: string, timeoutMs: number): Promise<void>;
  /** Evaluate a self-contained function in the page (serialized for CDP, so it
   *  must not close over outer variables; pass data via `arg`). */
  evaluate<A, R>(fn: (arg: A) => R, arg?: A): Promise<Awaited<R>>;
  waitForFunction<A>(fn: (arg: A) => unknown, arg: A, timeoutMs: number): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(opts: { type: "png" | "jpeg"; quality?: number }): Promise<Uint8Array>;
  emulateScreenMedia(): Promise<void>;
  pdf(opts: { widthPx: number; heightPx: number }): Promise<Uint8Array>;
}

export interface DriverBrowser {
  newPage(opts: { width: number; height: number; deviceScaleFactor?: number }): Promise<DriverPage>;
  close(): Promise<void>;
}

interface CdpResponse {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
}

/** One JSON-RPC connection to a single CDP page target. */
class CdpConnection {
  private nextId = 1;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  private eventListeners = new Map<string, Set<(params: unknown) => void>>();

  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as CdpResponse;
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message}`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const cb of this.eventListeners.get(msg.method) ?? []) cb(msg.params);
      }
    };
    ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP connection closed"));
      this.pending.clear();
    };
  }

  static connect(url: string, timeoutMs = 20000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => reject(new Error(`CDP WebSocket connect timed out (${url})`)), timeoutMs);
      ws.onopen = () => {
        clearTimeout(t);
        resolve(new CdpConnection(ws));
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error(`CDP WebSocket connect failed (${url})`));
      };
    });
  }

  send<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, cb: (params: unknown) => void): () => void {
    let set = this.eventListeners.get(method);
    if (!set) this.eventListeners.set(method, (set = new Set()));
    set.add(cb);
    return () => set.delete(cb);
  }

  /** Resolve on the next occurrence of `method`, reject after `timeoutMs`. */
  once(method: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const off = this.on(method, (params) => {
        clearTimeout(t);
        off();
        resolve(params);
      });
      const t = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

/** Serialize a self-contained function + argument into one CDP expression. */
function callExpression(fn: (arg: never) => unknown, arg?: unknown): string {
  return `(${fn.toString()})(${arg === undefined ? "" : JSON.stringify(arg)})`;
}

const b64ToBytes = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, "base64"));

class CdpPage implements DriverPage {
  constructor(private cdp: CdpConnection) {}

  async setContent(html: string, timeoutMs: number): Promise<void> {
    // Mirror playwright's setContent: document.write fires a real load event
    // once all deferred module scripts ran (Page.setDocumentContent does not).
    const loaded = this.cdp.once("Page.loadEventFired", timeoutMs);
    await this.rawEvaluate(
      `((html) => { document.open(); document.write(html); document.close(); })(${JSON.stringify(html)})`,
    );
    await loaded;
  }

  private async rawEvaluate(expression: string): Promise<unknown> {
    const res = await this.cdp.send<{
      result: { value?: unknown };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value;
  }

  evaluate<A, R>(fn: (arg: A) => R, arg?: A): Promise<Awaited<R>> {
    return this.rawEvaluate(callExpression(fn, arg)) as Promise<Awaited<R>>;
  }

  async waitForFunction<A>(fn: (arg: A) => unknown, arg: A, timeoutMs: number): Promise<void> {
    const expr = callExpression(fn, arg);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.rawEvaluate(expr)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`waitForFunction timed out after ${timeoutMs}ms`);
  }

  waitForTimeout(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async screenshot(opts: { type: "png" | "jpeg"; quality?: number }): Promise<Uint8Array> {
    const res = await this.cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: opts.type,
      ...(opts.type === "jpeg" && opts.quality !== undefined ? { quality: opts.quality } : {}),
    });
    return b64ToBytes(res.data);
  }

  async emulateScreenMedia(): Promise<void> {
    await this.cdp.send("Emulation.setEmulatedMedia", { media: "screen" });
  }

  async pdf(opts: { widthPx: number; heightPx: number }): Promise<Uint8Array> {
    // CDP paper sizes are inches at 96 CSS px/in.
    const res = await this.cdp.send<{ data: string }>("Page.printToPDF", {
      paperWidth: opts.widthPx / 96,
      paperHeight: opts.heightPx / 96,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      preferCSSPageSize: false,
    });
    return b64ToBytes(res.data);
  }
}

/** Flags for a Chrome we spawn ourselves. Close to what playwright passes, so
 *  captures render the same through either transport (srgb, hidden scrollbars:
 *  Windows' classic scrollbars would otherwise consume layout width). */
const CDP_LAUNCH_ARGS = [
  "--headless",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-component-update",
  "--force-color-profile=srgb",
  "--remote-debugging-port=0",
];

/** Launch `executablePath` with a DevTools port and attach to its initial page
 *  target over Bun's native WebSocket. */
export async function launchCdpBrowser(executablePath: string, extraArgs: string[]): Promise<DriverBrowser> {
  const userDataDir = mkdtempSync(join(tmpdir(), "liebstoeckel-cdp-"));
  const proc = Bun.spawn(
    [executablePath, ...CDP_LAUNCH_ARGS, ...extraArgs, `--user-data-dir=${userDataDir}`, "about:blank"],
    { stdout: "ignore", stderr: "ignore" },
  );

  const cleanup = () => {
    try {
      proc.kill();
    } catch {
      // already exited
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold locks; the OS temp dir is self-cleaning
    }
  };

  try {
    // Chrome writes the ephemeral port to <profile>/DevToolsActivePort on boot.
    let port = 0;
    const deadline = Date.now() + 30000;
    while (!port && Date.now() < deadline) {
      if (proc.exitCode !== null) throw new Error(`Chromium exited with code ${proc.exitCode} before DevTools came up`);
      try {
        port = parseInt(readFileSync(join(userDataDir, "DevToolsActivePort"), "utf8").split("\n")[0] ?? "", 10) || 0;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!port) throw new Error("Chromium did not expose a DevTools port within 30s");

    const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{
      type: string;
      webSocketDebuggerUrl?: string;
    }>;
    const target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!target?.webSocketDebuggerUrl) throw new Error("no page target on the DevTools endpoint");
    const cdp = await CdpConnection.connect(target.webSocketDebuggerUrl);

    return {
      async newPage({ width, height, deviceScaleFactor }) {
        await cdp.send("Page.enable");
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor: deviceScaleFactor ?? 1,
          mobile: false,
        });
        return new CdpPage(cdp);
      },
      async close() {
        cdp.close();
        cleanup();
      },
    };
  } catch (e) {
    cleanup();
    throw e;
  }
}
