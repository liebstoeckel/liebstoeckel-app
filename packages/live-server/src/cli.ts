#!/usr/bin/env bun
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
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
    const { bundleDeck } = await import("@liebstoeckel/engine/build");
    // Build to a throwaway dir, NOT the deck's own dist/. `liebstoeckel build` owns
    // dist/<slug>.html (ADR 0068); a stray dist/index.html written here would shadow
    // it for `push`'s default-file pick and confuse the two artifacts (ticket 0030).
    const outdir = mkdtempSync(join(tmpdir(), "lst-live-"));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await bundleDeck({ entry: "./index.html", outdir, inlinePackage: false });
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

interface ThumbSettings {
  enabled: boolean;
  width?: number;
  quality?: number;
  scale?: number;
  format?: "webp" | "jpeg" | "png";
}

/** Parse the thumbnail flags. Capture is ON by default — `--no-thumbnails` opts
 *  out; `--format/--width/--quality/--scale` mirror `liebstoeckel thumbs`. */
export function thumbSettings(argv: string[]): ThumbSettings {
  const num = (name: string): number | undefined => {
    const v = flag(argv, name);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const fmt = flag(argv, "--format");
  return {
    enabled: !argv.includes("--no-thumbnails"),
    width: num("--width"),
    quality: num("--quality"),
    scale: num("--scale"),
    format: fmt === "webp" || fmt === "jpeg" || fmt === "png" ? fmt : undefined,
  };
}

/** Capture + embed slide thumbnails into the deck HTML so the overview grid is
 *  instant and uniform. On by default. The gate/capture/embed/never-fatal policy
 *  lives in the thumbnails package's `withThumbnails`; this just wires it to the CLI
 *  (dynamic import so `--no-thumbnails` pays no playwright-core cost, and a missing
 *  module degrades to a hint rather than a crash). */
export async function addThumbnails(html: string, s: ThumbSettings): Promise<string> {
  if (!s.enabled) return html;
  let mod: typeof import("@liebstoeckel/thumbnails");
  try {
    mod = await import("@liebstoeckel/thumbnails");
  } catch {
    process.stderr.write("⚠  thumbnails skipped: @liebstoeckel/thumbnails not installed (pass --no-thumbnails to silence)\n");
    return html;
  }
  process.stderr.write("▶  capturing slide thumbnails …\n");
  const { html: out, manifest, skipped } = await mod.withThumbnails(html, {
    width: s.width,
    quality: s.quality,
    scale: s.scale,
    format: s.format,
    onSlide: (i, n) => process.stderr.write(`\r   slide ${i + 1}/${n}   `),
  });
  if (skipped) {
    process.stderr.write(`\r⚠  thumbnails skipped: ${skipped}            \n`);
    return html;
  }
  process.stderr.write(`\r✓  embedded ${Object.keys(manifest!.thumbs).length} thumbnails            \n`);
  return out;
}

/** LAN mode: serve the deck locally and relay Yjs over /sync. */
async function localMain(arg: string, thumbs: ThumbSettings, port?: number) {
  process.stderr.write(TRUST_WARNING + "\n");
  const html = await addThumbnails(await loadDeckHtml(arg), thumbs);
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
async function relayMain(arg: string, relayUrl: string, relayToken: string, thumbs: ThumbSettings) {
  process.stderr.write(TRUST_WARNING + "\n");
  const html = await addThumbnails(await loadDeckHtml(arg), thumbs);
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

/** Pure: did the user ask for help? (`-h`/`--help` anywhere in argv.) */
export const isHelp = (argv: string[]): boolean => argv.includes("-h") || argv.includes("--help");

const LIVE_USAGE =
  "usage: liebstoeckel live <deck.html | deck-project-dir> [--relay <url> --relay-token <tok>] [--port N]\n" +
  "       thumbnails are captured by default (needs Chromium); --no-thumbnails to skip,\n" +
  "       --format webp|jpeg|png --width N --quality N --scale N to tune them";

export async function runLive(argv: string[]) {
  if (isHelp(argv)) {
    console.log(LIVE_USAGE);
    return;
  }
  const arg = argv.find((a) => !a.startsWith("-"));
  if (!arg) {
    console.error(LIVE_USAGE);
    process.exit(1);
  }
  const thumbs = thumbSettings(argv);
  const relayUrl = flag(argv, "--relay");
  const relayToken = flag(argv, "--relay-token") ?? process.env.LIEBSTOECKEL_RELAY_TOKEN;
  if (relayUrl) {
    if (!relayToken) {
      console.error("--relay requires --relay-token <token> (or LIEBSTOECKEL_RELAY_TOKEN)");
      process.exit(1);
    }
    await relayMain(arg, relayUrl, relayToken, thumbs);
  } else {
    await localMain(arg, thumbs, Number(flag(argv, "--port")) || undefined);
  }
}

if (import.meta.main) void runLive(process.argv.slice(2));
