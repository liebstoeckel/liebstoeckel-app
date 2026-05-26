#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { scaffold } from "./new";

const HELP = `present-it — code-first presentations

usage:
  present-it new <name> [--brand <brand>]   scaffold a new deck under ./presentations
  present-it build [dir]                     build a deck → one self-contained .html (+ thumbnails)
  present-it live <deck|dir> [opts]          present live (LAN, or --relay <url> --relay-token <tok>)
  present-it relay [opts]                    run a public relay (--port, --tokens, --public-url)
  present-it thumbs <deck.html> [opts]       (re)generate thumbnails for a built deck

  present-it <deck|dir> [opts]               shorthand for \`present-it live <deck>\`
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const looksLikeDeck = (s: string | undefined): boolean =>
  !!s && (/\.html?$/i.test(s) || existsSync(resolve(s)));

async function runNew(argv: string[]) {
  const name = argv.find((a) => !a.startsWith("-"));
  if (!name) {
    console.error("usage: present-it new <name> [--brand <brand>]");
    process.exit(1);
  }
  try {
    const { dir, files } = await scaffold(name, { brand: flag(argv, "--brand") });
    console.log(`\n✓ created deck "${name}" → ${dir}\n`);
    for (const f of files) console.log(`   ${f}`);
    console.log(`\n   next:`);
    console.log(`     bun install`);
    console.log(`     present-it live ${dir}      # or: bun --cwd ${dir} run dev\n`);
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}

async function runBuild(argv: string[]) {
  const target = argv.find((a) => !a.startsWith("-"));
  const { buildDeckWithThumbnails } = await import("@present-it/thumbnails/build");
  const prev = process.cwd();
  if (target) process.chdir(resolve(target));
  try {
    await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
  } finally {
    process.chdir(prev);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "new":
      return runNew(rest);
    case "build":
      return runBuild(rest);
    case "live":
      return (await import("@present-it/live-server/cli")).runLive(rest);
    case "relay":
      return (await import("present-relay/cli")).runRelay(rest);
    case "thumbs":
      return (await import("@present-it/thumbnails/cli")).runThumbs(rest);
    case undefined:
    case "-h":
    case "--help":
      console.log(HELP);
      return;
    default:
      // shorthand: `present-it <deck>` → live
      if (looksLikeDeck(cmd)) {
        return (await import("@present-it/live-server/cli")).runLive([cmd!, ...rest]);
      }
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

if (import.meta.main) void main();
