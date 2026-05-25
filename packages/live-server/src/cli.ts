#!/usr/bin/env bun
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import QRCode from "qrcode";
import { startServer } from "./server";
import { buildLinks } from "./session";

export type TargetKind = "html" | "project" | "unknown";

/** Pure: decide how to treat a target path. */
export function classifyTargetPath(path: string, isDir: boolean): TargetKind {
  if (/\.html?$/i.test(path)) return "html";
  if (isDir || /package\.json$/i.test(path)) return "project";
  return "unknown";
}

const TRUST_WARNING = `
⚠  present-it live server
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
    const { buildDeck } = await import("@present-it/engine/build");
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

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: present-it <deck.html | deck-project-dir>");
    process.exit(1);
  }
  process.stderr.write(TRUST_WARNING + "\n");
  const html = await loadDeckHtml(arg);
  const live = await startServer({ html });

  const local = buildLinks(`http://localhost:${live.port}`, live.session);
  const qr = await QRCode.toString(live.links.viewer, { type: "terminal", small: true });
  console.log(`\n▶  present-it live — session ${live.session.id}\n`);
  console.log(`   on this machine   presenter  ${local.presenter}`);
  console.log(`                     audience   ${local.viewer}`);
  console.log(`   on the network    presenter  ${live.links.presenter}`);
  console.log(`                     audience   ${live.links.viewer}`);
  if (live.serverPlugins.length) console.log(`\n   server plugins:   ${live.serverPlugins.join(", ")}`);
  console.log(`\n   scan to follow along (network):\n${qr}`);

  const shutdown = () => {
    live.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) void main();
