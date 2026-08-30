import type { AnnotationEntry, DevTransport } from "./bridge";

// The local wire: same-origin HTTP against /__dev/* with the per-boot token,
// and SSE for server-pushed updates.

/** The subset of EventSource the fan-out needs, so tests can hand in a fake. */
export interface EventStream {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror?: ((event: Event) => void) | null;
  /** EventSource.readyState; 2 (CLOSED) after a non-OK response, which the browser never retries. */
  readyState?: number;
  close(): void;
}

const STREAM_CLOSED = 2;

/** A failed request, with the HTTP status so callers can tell a stale token
 *  (401: the server restarted) from a refused action (409) or a bad request. */
export class TransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

export type EventListener = (msg: Record<string, unknown>) => void;

/** One server stream shared by every subscriber. The stream opens with the
 *  first listener, closes with the last, and closes for good when the server
 *  announces `exit`: EventSource would otherwise reconnect forever against a
 *  process that is gone. Returns a `subscribe` with the DevTransport shape. */
export function sharedEvents(open: () => EventStream): (onMessage: EventListener) => () => void {
  const listeners = new Set<EventListener>();
  let source: EventStream | null = null;
  let exited = false;

  const closeSource = () => {
    source?.close();
    source = null;
  };

  const ensureOpen = () => {
    if (source || exited) return;
    const s = open();
    source = s;
    s.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return; // ignore malformed frames
      }
      if (!msg || typeof msg !== "object") return;
      for (const l of [...listeners]) {
        try {
          l(msg);
        } catch (err) {
          // One throwing listener must not starve the rest, and above all must
          // not skip the exit handling below (which stops the reconnect loop).
          console.error("dev-mode event listener failed", err);
        }
      }
      if (msg.type === "exit" && source === s) {
        exited = true;
        closeSource();
      }
    };
    // A non-OK response (a 401 after the server restarted with a new token)
    // closes the stream for good on the browser side, silently. Tell the
    // subscribers as a synthetic event so the UI can ask for a reload instead
    // of showing "Loading" forever; a transient drop keeps reconnecting on its
    // own and is not reported.
    s.onerror = () => {
      if (s.readyState !== STREAM_CLOSED || source !== s) return;
      exited = true;
      closeSource();
      for (const l of [...listeners]) {
        try {
          l({ type: "stream_closed" });
        } catch (err) {
          console.error("dev-mode event listener failed", err);
        }
      }
    };
  };

  return (onMessage) => {
    listeners.add(onMessage);
    ensureOpen();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(onMessage);
      if (listeners.size === 0) closeSource();
    };
  };
}

export function httpTransport(token: string): DevTransport {
  const authed = (path: string) => `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // The server's `hint` says what to do about it (free a locked file and
    // revert again); the bare error code is a fallback, not a message.
    if (!res.ok) throw new TransportError(String(data.hint ?? data.error ?? res.statusText), res.status);
    return data;
  }
  const subscribe = sharedEvents(() => new EventSource(authed("/__dev/events")));
  return {
    async getState() {
      const res = await fetch(authed("/__dev/state"));
      if (!res.ok) throw new TransportError(res.status === 401 ? "unauthorized" : "state fetch failed", res.status);
      return (await res.json()) as { annotations: Record<string, AnnotationEntry>; agentPolling: boolean; agentBusy?: boolean };
    },
    async saveAnnotation(input) {
      const data = await post("/__dev/annotations", input as unknown as Record<string, unknown>);
      return data.entry as unknown as AnnotationEntry;
    },
    async uploadScreenshot(id, png) {
      await fetch(authed(`/__dev/screenshot?id=${encodeURIComponent(id)}`), {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
    },
    async setStatus(id, status) {
      await post("/__dev/annotation-status", { id, status });
    },
    async dispatch() {
      const data = await post("/__dev/dispatch", {});
      return data as unknown as { batchId: string; agentPolling: boolean };
    },
    async revert(batchId) {
      await post("/__dev/revert", { batchId });
    },
    subscribe,
  };
}
