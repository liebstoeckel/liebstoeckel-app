#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { readServerInfo, startDevServer } from "./server";
import { runAutoPatches } from "@liebstoeckel/cli/migrations";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

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
    if (res.status === 401) throw new Error("unauthorized: the dev server token changed; restart `liebstoeckel dev`");
    if (res.status === 403) throw new Error("forbidden: the dev server rejected the Host header; dial it by localhost or the --host it was bound to");
    if (!res.ok) throw new Error(`poll failed: ${res.status} ${res.statusText}`);
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
    if (!info) {
      console.error(JSON.stringify({ error: "no_dev_server", hint: "start one with: liebstoeckel dev" }));
      process.exit(1);
    }
    // Dial what the server bound: loopback by default, or the interface named
    // by --host (a server bound to a LAN address is not reachable on 127.0.0.1).
    const dialHost = !info.hostname || info.hostname === "0.0.0.0" ? "127.0.0.1" : info.hostname;
    const base = `http://${dialHost.includes(":") ? `[${dialHost}]` : dialHost}:${info.port}`;

    if (args.reply) {
      const raw = (args as { _?: unknown })._;
      const positionals = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" && raw ? [raw] : [];
      const status = positionals[0];
      if (status !== "done" && status !== "error") {
        console.error(JSON.stringify({ error: "invalid_reply", hint: "usage: dev poll --reply <id> done --data '<json>' | --reply <id> error \"reason\"" }));
        process.exit(1);
      }
      let data: unknown;
      if (args.data) {
        try {
          data = JSON.parse(args.data);
        } catch (err) {
          console.error(JSON.stringify({ error: "invalid_data_json", message: err instanceof Error ? err.message : String(err) }));
          process.exit(1);
        }
      }
      const message = status === "error" ? positionals.slice(1).join(" ") : undefined;
      const res = await fetch(`${base}/__dev/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: info.token, id: args.reply, type: status, data, message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(JSON.stringify(body));
        process.exit(1);
      }
      console.log(JSON.stringify(body));
      return;
    }

    const totalTimeout = Number(args.timeout ?? 600_000) || 600_000;
    try {
      console.log(JSON.stringify(await pollOnce(base, info.token, totalTimeout)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A connection refusal means the server.json is stale (the server was
      // killed without cleaning up), not that the token changed.
      const refused = /ECONNREFUSED|Unable to connect|ConnectionRefused/i.test(message);
      console.error(
        JSON.stringify(
          refused
            ? { error: "no_dev_server", hint: "the recorded dev server is not running; start one with: liebstoeckel dev" }
            : { error: "poll_failed", message },
        ),
      );
      process.exit(1);
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
    if (!existsSync(indexPath)) {
      console.error(`No index.html in ${deckDir}; run from a deck or pass --dir.`);
      process.exit(1);
    }
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
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error(`Invalid --port ${args.port}`);
      process.exit(1);
    }
    let server;
    try {
      server = await startDevServer({
        deckDir,
        port,
        hostname: args.host ?? "127.0.0.1",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: unknown })?.code;
      if (code === "EADDRINUSE" || /EADDRINUSE|in use/i.test(message)) {
        console.error(`Port ${port} is already in use (another dev server?). Pick another with --port, or stop the other process.`);
        process.exit(1);
      }
      throw err;
    }
    // Ctrl-C or a tmux teardown must not leave a server.json pointing at a
    // dead process (which `dev poll` would otherwise try to dial). Idempotent
    // and installed with `on`, not `once`: a second signal (the re-exec parent
    // forwarding the Ctrl-C both already received) must not fall through to
    // the default handler and kill the process before server.json is removed.
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      server.stop();
      setTimeout(() => process.exit(0), 300);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    if (args.json) {
      console.log(JSON.stringify({ ok: true, url: server.url, port: server.port, _instructions: bootInstructions() }));
    } else {
      console.log(`▶  ${server.url}/  (dev mode: sidebar + your deck; the plain deck alone is ${server.url}/deck)`);
      console.log(`   agent loop: liebstoeckel dev poll${args.dir ? ` --dir ${args.dir}` : ""}`);
    }
  },
});

if (import.meta.main) {
  runMain(devCommand);
}
