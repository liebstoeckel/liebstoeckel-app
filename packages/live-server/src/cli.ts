#!/usr/bin/env bun
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { startServer } from "./server";
import { buildLinks } from "./session";
import { uploadDeck, runServerPluginsViaRelay, endSession } from "./relay-client";

export type TargetKind = "html" | "project" | "unknown";

/** Pure: decide how to treat a target path. */
export function classifyTargetPath(path: string, isDir: boolean): TargetKind {
  if (/\.html?$/i.test(path)) return "html";
  if (isDir || /package\.json$/i.test(path)) return "project";
  return "unknown";
}

const TRUST_WARNING = `
⚠  liebstoeckel live server
   This builds and runs the deck's code, including any plugins it bundles —
   server-side plugin code executes on THIS machine. Only run decks you trust.
`;

/** Resolve a target into deck HTML (building the project if needed). */
export async function loadDeckHtml(arg: string): Promise<string> {
  const abs = resolve(arg);
  const isDir = statSync(abs).isDirectory();
  const kind = classifyTargetPath(abs, isDir);
  if (kind === "html") return Bun.file(abs).text();
  if (kind === "project") {
    const dir = abs.endsWith("package.json") ? dirname(abs) : abs;
    const { buildDeck } = await import("@liebstoeckel/engine/build");
    const outdir = join(dir, "dist");
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await buildDeck({ entry: "./index.html", outdir: "./dist" });
    } finally {
      process.chdir(prev);
    }
    return Bun.file(join(outdir, "index.html")).text();
  }
  throw new Error(`Cannot present target: ${arg} (expected a .html file or a deck project)`);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** LAN mode: serve the deck locally and relay Yjs over /sync. */
async function localMain(arg: string, port?: number) {
  process.stderr.write(TRUST_WARNING + "\n");
  const html = await loadDeckHtml(arg);
  const live = await startServer({ html, port });

  const local = buildLinks(`http://localhost:${live.port}`, live.session);
  console.log(`\n▶  liebstoeckel live — session ${live.session.id}\n`);
  console.log(`   on this machine   presenter  ${local.presenter}`);
  console.log(`                     audience   ${local.viewer}`);
  console.log(`   on the network    presenter  ${live.links.presenter}`);
  console.log(`                     audience   ${live.links.viewer}`);
  if (live.serverPlugins.length) console.log(`\n   server plugins:   ${live.serverPlugins.join(", ")}`);

  const shutdown = () => {
    live.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Relay mode: upload the deck to a public relay; run the deck's server plugins
 *  locally as the relay's privileged peer (deck code never runs on the relay). */
async function relayMain(arg: string, relayUrl: string, relayToken: string) {
  process.stderr.write(TRUST_WARNING + "\n");
  const html = await loadDeckHtml(arg);
  process.stderr.write(`▶  uploading deck to ${relayUrl} …\n`);
  const info = await uploadDeck(relayUrl, relayToken, html);
  const runner = await runServerPluginsViaRelay({
    html,
    syncUrl: info.urls.sync,
    runnerToken: info.runnerToken,
    sessionId: info.id,
  });

  console.log(`\n▶  liebstoeckel live (relayed) — session ${info.id}\n`);
  console.log(`   public            presenter  ${info.urls.presenter}`);
  console.log(`                     audience   ${info.urls.viewer}`);
  if (runner.plugins.length) {
    console.log(`\n   server plugins (running locally): ${runner.plugins.join(", ")}`);
  }

  const shutdown = async () => {
    runner.stop();
    await endSession(relayUrl, relayToken, info.id);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

export async function runLive(argv: string[]) {
  const arg = argv.find((a) => !a.startsWith("-"));
  if (!arg) {
    console.error("usage: liebstoeckel live <deck.html | deck-project-dir> [--relay <url> --relay-token <tok>] [--port N]");
    process.exit(1);
  }
  const relayUrl = flag(argv, "--relay");
  const relayToken = flag(argv, "--relay-token") ?? process.env.LIEBSTOECKEL_RELAY_TOKEN;
  if (relayUrl) {
    if (!relayToken) {
      console.error("--relay requires --relay-token <token> (or LIEBSTOECKEL_RELAY_TOKEN)");
      process.exit(1);
    }
    await relayMain(arg, relayUrl, relayToken);
  } else {
    await localMain(arg, Number(flag(argv, "--port")) || undefined);
  }
}

if (import.meta.main) void runLive(process.argv.slice(2));
