import type * as Y from "yjs";
import { connectLive } from "@present-it/engine/live";
import { extractManifest, rehydrateServerBundle } from "./manifest";

export interface RelaySessionInfo {
  id: string;
  presenterToken: string;
  viewerToken: string;
  runnerToken: string;
  expiresAt: number;
  urls: { presenter: string; viewer: string; sync: string };
}

/** Upload a built deck to a relay and create a public session (tokens + urls). */
export async function uploadDeck(relayUrl: string, accountToken: string, html: string): Promise<RelaySessionInfo> {
  const res = await fetch(`${relayUrl.replace(/\/$/, "")}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${accountToken}`, "content-type": "text/html" },
    body: html,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`relay upload failed (${res.status} ${res.statusText})${msg ? `: ${msg}` : ""}`);
  }
  return (await res.json()) as RelaySessionInfo;
}

/** Tear down a relay session (best-effort). */
export async function endSession(relayUrl: string, accountToken: string, id: string): Promise<void> {
  await fetch(`${relayUrl.replace(/\/$/, "")}/api/sessions/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accountToken}` },
  }).catch(() => {});
}

export interface RunnerHandle {
  plugins: string[];
  stop(): void;
}

type ServerCtx = { doc: Y.Doc; session: { id: string } };

/** Run a deck's *server* plugins locally and apply their effects to the relay's
 *  shared doc by connecting as the privileged "runner" peer. The relay never runs
 *  deck code — it only relays the resulting Yjs updates to viewers. No-op (still
 *  resolves) for decks without any server plugins. */
export async function runServerPluginsViaRelay(opts: {
  html: string;
  /** ws(s)://<relay>/sync/<id> (no token) */
  syncUrl: string;
  runnerToken: string;
  sessionId: string;
}): Promise<RunnerHandle> {
  const manifest = extractManifest(opts.html);
  const serverPlugins = (manifest?.plugins ?? []).filter((p) => p.hasServer && p.server);
  if (serverPlugins.length === 0) return { plugins: [], stop() {} };

  const sep = opts.syncUrl.includes("?") ? "&" : "?";
  const conn = connectLive(
    {
      ws: `${opts.syncUrl}${sep}t=${encodeURIComponent(opts.runnerToken)}`,
      session: opts.sessionId,
      role: "presenter",
      token: opts.runnerToken,
    },
    "runner",
  );

  const cleanups: Array<() => void> = [];
  const plugins: string[] = [];
  for (const p of serverPlugins) {
    const mod = await rehydrateServerBundle(p.server!, p.name);
    if (typeof mod.default === "function") {
      const teardown = (mod.default as (ctx: ServerCtx) => unknown)({
        doc: conn.doc,
        session: { id: opts.sessionId },
      });
      if (typeof teardown === "function") cleanups.push(teardown as () => void);
      plugins.push(p.name);
    }
  }

  return {
    plugins,
    stop() {
      for (const c of cleanups) c();
      conn.close();
    },
  };
}
