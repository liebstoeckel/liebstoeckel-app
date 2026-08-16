#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { resolve } from "node:path";
import { bootInstructions } from "./instructions";
import { readServerInfo, startDevServer } from "./server";
import { addDevLoaderTag, hasDevLoaderTag } from "./inject";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    const base = `http://127.0.0.1:${info.port}`;

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
      console.error(JSON.stringify({ error: "poll_failed", message: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    }
  },
});

export const devCommand = defineCommand({
  meta: {
    name: "dev",
    description: "serve a deck with HMR plus the dev-mode drawer (annotations); `dev poll` is the agent loop",
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
    if (deckDir !== process.cwd()) {
      const self = new URL(import.meta.url).pathname;
      const child = Bun.spawn({
        cmd: [
          process.execPath,
          self,
          ...(args.port ? ["--port", String(args.port)] : []),
          ...(args.host ? ["--host", String(args.host)] : []),
          ...(args.json ? ["--json"] : []),
        ],
        cwd: deckDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      process.exit(await child.exited);
    }
    // The loader tag is permanent deck source (stripped from builds); add it
    // once for decks that predate dev mode.
    const html = readFileSync(indexPath, "utf-8");
    if (!hasDevLoaderTag(html)) {
      writeFileSync(indexPath, addDevLoaderTag(html), "utf-8");
      console.error("✚ added the dev-mode loader tag to index.html (inert outside `dev`; stripped from builds)");
    }
    const server = await startDevServer({
      deckDir,
      port: Number(args.port ?? 3000) || 3000,
      hostname: args.host ?? "127.0.0.1",
    });
    if (args.json) {
      console.log(JSON.stringify({ ok: true, url: server.url, port: server.port, _instructions: bootInstructions() }));
    } else {
      console.log(`▶  ${server.url}  (dev mode: open in a browser, annotate via the drawer)`);
      console.log(`   agent loop: liebstoeckel dev poll${args.dir ? ` --dir ${args.dir}` : ""}`);
    }
  },
});

if (import.meta.main) {
  runMain(devCommand);
}
