#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { readServerInfo, startDevServer } from "./server";
import { formatPluginProblems } from "./serve-plugins";
import { removeServerInfo } from "./local-backend";
import { runAutoPatches } from "@liebstoeckel/cli/migrations";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

/** The CLI's error document: one JSON object on stdout, `code` is what an agent
 *  branches on. Exit 1 for a failure, 2 for a usage mistake. */
function failJson(code: string, error: string, hint?: string, exit: 1 | 2 = 1): never {
  console.log(JSON.stringify({ ok: false, error, code, ...(hint ? { hint } : {}) }));
  process.exit(exit);
}

/** A poll failure that already knows its code. */
class PollError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

// Agent-facing poll client: one-shot long poll or a reply. Each HTTP request
// stays under undici's fixed 300s header timeout; the loop below synthesizes a
// longer wait from shorter requests.
const PER_REQUEST_TIMEOUT_MS = 240_000;

async function pollOnce(base: string, token: string, totalTimeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + totalTimeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { type: "timeout" };
    const slice = Math.min(Math.max(remaining, 1_000), PER_REQUEST_TIMEOUT_MS);
    const res = await fetch(`${base}/__dev/poll?token=${token}&timeout=${slice}`);
    if (res.status === 401) {
      throw new PollError("unauthorized", "the dev server token changed", "the dev server restarted; the loop is over until `liebstoeckel dev` runs again");
    }
    if (res.status === 403) {
      throw new PollError(
        "forbidden_host",
        "the dev server rejected the Host header",
        "poll from the machine that runs `liebstoeckel dev`, by localhost or the --host it was bound to",
      );
    }
    if (!res.ok) throw new PollError("poll_failed", `poll failed: ${res.status} ${res.statusText}`);
    const event = (await res.json()) as { type?: string };
    if (event?.type === "timeout" && Date.now() < deadline) continue;
    return event;
  }
}

export const devPollCommand = defineCommand({
  meta: { name: "poll", description: "wait for a dev-mode event (annotation batches), or reply to one" },
  args: {
    dir: { type: "string", description: "deck directory (default: cwd)" },
    timeout: { type: "string", description: "max wait in ms (default 600000)" },
    reply: { type: "string", description: "event id to reply to (pair with a positional done|error)" },
    data: { type: "string", description: "JSON result for a done reply: {applied, files, notes}" },
  },
  async run({ args }) {
    const deckDir = resolve(args.dir ?? ".");
    const info = readServerInfo(deckDir);
    if (!info) failJson("no_dev_server", `no dev server is running for ${deckDir}`, "start one with: liebstoeckel dev");
    // Dial what the server bound: loopback by default, or the interface named
    // by --host (a server bound to a LAN address is not reachable on 127.0.0.1).
    const dialHost = !info.hostname || info.hostname === "0.0.0.0" ? "127.0.0.1" : info.hostname;
    const base = `http://${dialHost.includes(":") ? `[${dialHost}]` : dialHost}:${info.port}`;

    if (args.reply) {
      const raw = (args as { _?: unknown })._;
      const positionals = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" && raw ? [raw] : [];
      const status = positionals[0];
      if (status !== "done" && status !== "error") {
        failJson(
          "invalid_reply",
          "a reply needs a status: done or error",
          "usage: dev poll --reply <id> done --data '<json>' | --reply <id> error \"reason\"",
          2,
        );
      }
      let data: unknown;
      if (args.data) {
        try {
          data = JSON.parse(args.data);
        } catch (err) {
          failJson("invalid_data_json", `--data is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, undefined, 2);
        }
      }
      const message = status === "error" ? positionals.slice(1).join(" ") : undefined;
      const res = await fetch(`${base}/__dev/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: info.token, id: args.reply, type: status, data, message }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown; hint?: unknown };
      if (!res.ok) {
        // Named fields only: the server's id becomes the code, its hint stays the hint.
        const code = typeof body.error === "string" ? body.error : "reply_failed";
        failJson(code, `the dev server refused the reply (${code})`, typeof body.hint === "string" ? body.hint : undefined);
      }
      console.log(JSON.stringify(body));
      return;
    }

    const totalTimeout = Number(args.timeout ?? 600_000) || 600_000;
    try {
      console.log(JSON.stringify(await pollOnce(base, info.token, totalTimeout)));
    } catch (err) {
      if (err instanceof PollError) failJson(err.code, err.message, err.hint);
      const message = err instanceof Error ? err.message : String(err);
      // A connection refusal means the server.json is stale (the server was
      // killed without cleaning up), not that the token changed.
      const refused = /ECONNREFUSED|Unable to connect|ConnectionRefused/i.test(message);
      if (refused) failJson("no_dev_server", "the recorded dev server is not running", "start one with: liebstoeckel dev");
      failJson("poll_failed", message);
    }
  },
});

export const devCommand = defineCommand({
  meta: {
    name: "dev",
    description: "serve a deck with HMR beside the dev-mode sidebar (annotations, slide requests); `dev poll` is the agent loop",
  },
  args: {
    dir: { type: "string", description: "deck directory (default: cwd)" },
    port: { type: "string", description: "port (default: 3000)" },
    host: { type: "string", description: "bind hostname (default 127.0.0.1; 0.0.0.0 to expose)" },
    json: { type: "boolean", description: "print startup info as JSON" },
    live: { type: "boolean", description: "mirror this folder with the cloud deck's live sources (needs `push --source` once), coming soon" },
  },
  subCommands: {
    poll: devPollCommand,
  },
  async run({ args, rawArgs }) {
    // citty invokes the parent run even when a subcommand matched; serving a
    // second server under `dev poll` would be nonsense, so bail out here.
    if (rawArgs?.[0] === "poll") return;
    const deckDir = resolve(args.dir ?? ".");
    const indexPath = join(deckDir, "index.html");
    // With --json the startup outcome is one JSON document on stdout, failures included.
    const startupFail = (code: string, message: string, hint?: string, exit: 1 | 2 = 1): never => {
      if (args.json) failJson(code, message, hint, exit);
      console.error(hint ? `${message}. ${hint}` : message);
      process.exit(exit);
    };
    if (!existsSync(indexPath)) startupFail("not_a_deck", `No index.html in ${deckDir}`, "Run from a deck or pass --dir.");
    // Bun reads the deck's bunfig.toml ([serve.static] plugins: Tailwind, MDX)
    // from the process cwd at startup, so serving a --dir deck from elsewhere
    // would silently lose the HTML pipeline's plugins. Re-exec with cwd set.
    // Compared by real path so a symlinked deck dir does not re-exec forever.
    if (realpathSync(deckDir) !== realpathSync(process.cwd())) {
      // A filesystem path, not URL.pathname: that would percent-encode spaces
      // and keep the leading slash before a Windows drive letter.
      const self = import.meta.path;
      const child = Bun.spawn({
        cmd: [
          process.execPath,
          self,
          // Absolute, so the child's printed `dev poll --dir` hint works from any cwd.
          "--dir",
          deckDir,
          ...(args.port ? ["--port", String(args.port)] : []),
          ...(args.host ? ["--host", String(args.host)] : []),
          ...(args.json ? ["--json"] : []),
          ...(args.live ? ["--live"] : []),
        ],
        cwd: deckDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      // The child is the server. A signal aimed at this process alone (a
      // supervisor, tmux, `kill`) must reach it, or it keeps serving behind a
      // live server.json with nobody attached; a terminal Ctrl-C signals both,
      // and the child's shutdown is idempotent, so forwarding is harmless then.
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.on(signal, () => child.kill(signal));
      }
      process.exit(await child.exited);
    }
    // Scaffold migrations for the surfaces dev serves: decks scaffolded before
    // a convention change get patched here when the file still matches the
    // scaffolded shape, and a hint (never a rewrite) when it diverged.
    const { applied, hinted, warnings } = runAutoPatches(deckDir, ["entry", "index.html"]);
    for (const w of warnings) console.error(`⚠ ${w}`);
    for (const a of applied) console.error(`↻ migrated ${a.file} (${a.id}): ${a.reason}`);
    for (const h of hinted) {
      console.error(`⚠ migration needed (${h.id}): ${h.reason}; apply it per the skill guide ${h.reference}, or opt out via package.json liebstoeckel.migrationOptOut`);
    }
    const port = args.port === undefined ? 3000 : Number(args.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) startupFail("usage", `Invalid --port ${args.port}`, undefined, 2);
    // Catch up and connect before serving, so the first page load already
    // shows the live files.
    let live: { stop(): void } | null = null;
    if (args.live) {
      const { startLive } = await import("./live.ts");
      try {
        live = await startLive(deckDir, (line) => console.error(`⇄ ${line}`));
      } catch (err) {
        startupFail("live_failed", err instanceof Error ? err.message : String(err));
      }
    }
    // Set when the server stops on purpose (a signal, or `/__dev/stop`), so
    // the exit hook below can tell that apart from Bun ending the process.
    let stopping = false;
    let server;
    try {
      server = await startDevServer({
        deckDir,
        port,
        hostname: args.host ?? "127.0.0.1",
        onStop: () => {
          stopping = true;
        },
        // What the open deck warns about, so an author who only watches the
        // terminal (or an agent reading it) sees it too.
        onDeckLog: ({ level, message }) => console.error(`${level === "error" ? "✕" : "⚠"} deck: ${message}`),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: unknown })?.code;
      if (code === "EADDRINUSE" || /EADDRINUSE|in use/i.test(message)) {
        startupFail("port_in_use", `Port ${port} is already in use (another dev server?)`, "Pick another with --port, or stop the other process.");
      }
      throw err;
    }
    // Ctrl-C or a tmux teardown must not leave a server.json pointing at a
    // dead process (which `dev poll` would otherwise try to dial). Idempotent
    // and installed with `on`, not `once`: a second signal (the re-exec parent
    // forwarding the Ctrl-C both already received) must not fall through to
    // the default handler and kill the process before server.json is removed.
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      live?.stop();
      server.stop();
      setTimeout(() => process.exit(0), 300);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    // Bun can still end the process on its own (a bundler plugin that loads
    // but fails inside Bun, for one). The exit code is Bun's; what it does not
    // say is that the dev server and the live mirror went with it. The hook
    // sees code 0 even then, so it keys on `stopping`, not on the code.
    process.on("exit", () => {
      if (stopping) return;
      removeServerInfo(deckDir, process.pid);
      console.error("✕ the dev server stopped unexpectedly (see the error above); restart `liebstoeckel dev`");
      if (live) console.error("⇄ live: stopped, edits no longer reach this folder or the cloud deck");
    });
    for (const line of server.pluginProblems.length > 0 ? formatPluginProblems(deckDir, server.pluginProblems) : []) {
      console.error(`⚠ ${line}`);
    }
    if (args.json) {
      console.log(
        JSON.stringify({
          ok: true,
          url: server.url,
          port: server.port,
          ...(server.pluginProblems.length > 0 ? { pluginProblems: server.pluginProblems } : {}),
          _instructions: bootInstructions(),
        }),
      );
    } else {
      console.log(`▶  ${server.url}/  (dev mode: sidebar + your deck; the plain deck alone is ${server.url}/deck)`);
      console.log(`   agent loop: liebstoeckel dev poll${args.dir ? ` --dir ${args.dir}` : ""}`);
      if (live) console.log("   live: this folder is mirrored with the cloud deck");
    }
  },
});

// Top-level await, never a floating `void runMain()`: on Bun 1.4.0 for Windows a
// rejecting Bun.file() read inside an un-awaited promise drops the event loop's
// last reference, so the process exits 0 mid-command with no output at all.
// Awaiting here keeps module evaluation (and the process) alive for the whole run.
if (import.meta.main) {
  await runMain(devCommand);
}
