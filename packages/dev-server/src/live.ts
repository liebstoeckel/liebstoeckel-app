// `liebstoeckel dev --live`: catch up with the deck's live document, then keep
// the folder and the document mirrored while the dev server runs.

import { LiveMirror } from "./live-mirror.ts";
import { SyncClient } from "./sync.ts";

export interface LiveSession {
  stop(): void;
}

export class LiveStartError extends Error {}

async function gitUserName(dir: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "-C", dir, "config", "user.name"], { stdout: "pipe", stderr: "ignore" });
    const name = (await new Response(proc.stdout).text()).trim();
    return (await proc.exited) === 0 && name ? name : null;
  } catch {
    return null;
  }
}

export async function startLive(deckDir: string, log: (line: string) => void): Promise<LiveSession> {
  const src = await import("@liebstoeckel/cli/source");
  const state = src.readSyncState(deckDir);
  if (!state) throw new LiveStartError("this folder is not linked to a cloud deck; run `liebstoeckel push --source` first");
  const cloud = await src.cloudFromCreds({}, state);
  if (!cloud) throw new LiveStartError("not logged in; run `liebstoeckel login`");
  let access = await src.sourceAccess(cloud, state.deckId, false);

  const pulled = await src.pullDeck(deckDir, state, access);
  if (pulled.kind === "conflict") {
    const files = pulled.conflicts.map((c) => `  ${c.path} (${c.kind})`).join("\n");
    throw new LiveStartError(`your files and the live deck conflict; resolve the markers, then start again:\n${files}`);
  }
  if (pulled.kind !== "in-sync") log(`caught up with the live deck (${pulled.written.length} file(s) updated locally)`);
  if (access.role === "read") log("read-only access: live edits reach your files, but yours are not shared");

  const client = new SyncClient({
    url: async () => {
      // Grants are short-lived; fetch a fresh one when reconnecting late.
      if (access.expiresAt - Date.now() < 60_000) access = await src.sourceAccess(cloud, state.deckId, false);
      return `${access.wsUrl}?t=${encodeURIComponent(access.grant)}`;
    },
    onNotice: (n) => {
      if (n.type === "error") log(`live: ${n.message}`);
    },
    onStatus: (status) => {
      if (status === "closed") log("live: disconnected, reconnecting");
    },
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new LiveStartError("could not reach the live deck")), 15_000),
  );
  try {
    await Promise.race([client.ready, timeout]);
  } catch (err) {
    client.close();
    throw err;
  }
  client.awareness.setLocalState({ user: { name: (await gitUserName(deckDir)) ?? "developer" }, kind: "cli" });

  const mirror = new LiveMirror({
    dir: deckDir,
    client,
    log,
    onCheckpoint: (record) => {
      // The folder mirrors the document, so a checkpoint is a valid merge base.
      const current = src.readSyncState(deckDir);
      if (current) src.writeSyncState(deckDir, { ...current, base: record.commit, pending: null });
      const who = record.authors.map((a) => a.name).join(", ");
      log(`checkpoint ${record.commit.slice(0, 8)}: ${record.message} (${who})`);
    },
  });
  mirror.start();
  return {
    stop() {
      mirror.stop();
      client.close();
    },
  };
}
