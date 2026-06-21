#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
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
   This builds and runs the deck's code, including any plugins it bundles, server-side plugin code executes on THIS machine. Only run decks you trust.
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
    // dist/<slug>.html ((internal ADR)); a stray dist/index.html written here would shadow
    // it for `push`'s default-file pick and confuse the two artifacts ((internal ticket)).
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

interface ThumbSettings {
  enabled: boolean;
  width?: number;
  quality?: number;
  scale?: number;
  format?: "webp" | "jpeg" | "png";
}

/** The thumbnail-related flags shared by `live`, `thumbs`, and `build`. Capture is
 *  ON by default; `--no-thumbnails` flips `thumbnails` to false. */
export interface ThumbFlags {
  thumbnails?: boolean;
  format?: string;
  width?: string;
  quality?: string;
  scale?: string;
}

/** Derive thumbnail settings from the parsed flags. Capture is ON unless
 *  `--no-thumbnails` was passed; an unknown `--format` and non-numeric sizes are
 *  ignored (mirrors `liebstoeckel thumbs`). Pure, the unit-test anchor. */
export function thumbSettings(f: ThumbFlags): ThumbSettings {
  const num = (v: string | undefined): number | undefined => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    enabled: f.thumbnails !== false,
    width: num(f.width),
    quality: num(f.quality),
    scale: num(f.scale),
    format: f.format === "webp" || f.format === "jpeg" || f.format === "png" ? f.format : undefined,
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
  console.log(`\n▶  liebstoeckel live, session ${live.session.id}\n`);
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

  console.log(`\n▶  liebstoeckel live (relayed), session ${info.id}\n`);
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

export const liveCommand = defineCommand({
  meta: {
    name: "live",
    description: "present live (LAN by default, or through a public --relay)",
  },
  args: {
    deck: {
      type: "positional",
      required: false,
      description: "deck .html or deck source dir (default: cwd)",
      valueHint: "deck.html|deck-dir",
    },
    dir: { type: "string", description: "deck directory (alternative to the positional)", valueHint: "deck" },
    relay: { type: "string", description: "public relay URL to present through", valueHint: "url" },
    "relay-token": { type: "string", description: "relay account token (or LIEBSTOECKEL_RELAY_TOKEN)", valueHint: "tok" },
    port: { type: "string", description: "LAN listen port", valueHint: "N" },
    thumbnails: {
      type: "boolean",
      default: true,
      description: "capture slide thumbnails (needs Chromium)",
      negativeDescription: "skip thumbnail capture",
    },
    format: { type: "string", description: "thumbnail image format", valueHint: "webp|jpeg|png" },
    width: { type: "string", description: "thumbnail width in px", valueHint: "N" },
    quality: { type: "string", description: "thumbnail image quality", valueHint: "N" },
    scale: { type: "string", description: "thumbnail device scale factor", valueHint: "N" },
  },
  async run({ args }) {
    // Deck targeting ((internal ADR)): a leading positional, else --dir, else cwd.
    const arg = args.deck ?? args.dir ?? ".";
    const thumbs = thumbSettings(args);
    const relayUrl = args.relay;
    const relayToken = args["relay-token"] ?? process.env.LIEBSTOECKEL_RELAY_TOKEN;
    if (relayUrl) {
      if (!relayToken) {
        console.error("--relay requires --relay-token <token> (or LIEBSTOECKEL_RELAY_TOKEN)");
        process.exit(1);
      }
      await relayMain(arg, relayUrl, relayToken, thumbs);
    } else {
      await localMain(arg, thumbs, Number(args.port) || undefined);
    }
  },
});

if (import.meta.main) void runMain(liveCommand);
