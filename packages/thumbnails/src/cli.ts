#!/usr/bin/env bun
import { resolve } from "node:path";
import { statSync } from "node:fs";
import { addThumbnailsToFile } from "./index";

function flagNum(argv: string[], name: string): number | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.error("usage: present-it-thumbnails <built-deck.html> [--width 320] [--quality 80] [--scale 2]");
    process.exit(1);
  }
  const abs = resolve(file);
  try {
    if (!statSync(abs).isFile()) throw new Error("not a file");
  } catch {
    console.error(`cannot read deck: ${file}`);
    process.exit(1);
  }

  const width = flagNum(argv, "--width");
  const quality = flagNum(argv, "--quality");
  const scale = flagNum(argv, "--scale");

  process.stderr.write(`▶  capturing thumbnails for ${file}\n`);
  const manifest = await addThumbnailsToFile(abs, {
    width,
    quality,
    scale,
    onSlide: (i, n) => process.stderr.write(`\r   slide ${i + 1}/${n}   `),
  });
  process.stderr.write("\n");
  const n = Object.keys(manifest.thumbs).length;
  console.log(`✓ embedded ${n} thumbnail${n === 1 ? "" : "s"} (${manifest.w}×${manifest.h}) into ${file}`);
}

if (import.meta.main) void main();
