import type { AnnotationEntry, DevTransport } from "./bridge";

// The local wire: same-origin HTTP against /__dev/* with the per-boot token,
// and SSE for server-pushed updates.

export function httpTransport(token: string): DevTransport {
  const authed = (path: string) => `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? res.statusText));
    return data;
  }
  return {
    async getState() {
      const res = await fetch(authed("/__dev/state"));
      if (!res.ok) throw new Error("state fetch failed");
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
    subscribe(onMessage) {
      const source = new EventSource(authed("/__dev/events"));
      source.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };
      return () => source.close();
    },
  };
}
