import { join } from "node:path";
import { bundleDeck } from "@liebstoeckel/engine/build";
import { withThumbnails } from "./index";
import type { CaptureOptions } from "./capture";

export interface BuildDeckOptions {
  entry?: string;
  outdir?: string;
  minify?: boolean;
  pkgJson?: string;
}

/** Build a deck to a single self-contained `.html` and, **by default**, capture +
 *  embed slide thumbnails. The batteries-included default a deck's `build.ts` uses —
 *  it wraps engine's browser-free `bundleDeck` primitive. Thumbnails are skipped,
 *  not failed, when `LIEBSTOECKEL_NO_THUMBS` is set or no Chromium is available
 *  (the policy lives in `withThumbnails`). */
export async function buildDeck(build: BuildDeckOptions = {}, capture: CaptureOptions = {}): Promise<void> {
  const outdir = build.outdir ?? "./dist";
  await bundleDeck(build);
  const out = join(outdir, "index.html");
  console.log(`✓ built ${out}`);

  const onSlide = capture.onSlide ?? ((i: number, n: number) => process.stderr.write(`\r  thumbnail ${i + 1}/${n}   `));
  const { html, manifest, skipped } = await withThumbnails(await Bun.file(out).text(), { ...capture, onSlide });
  if (skipped) {
    console.log(`  thumbnails skipped: ${skipped}`);
    return;
  }
  await Bun.write(out, html);
  process.stderr.write("\n");
  console.log(`✓ embedded ${Object.keys(manifest!.thumbs).length} thumbnails (${manifest!.w}×${manifest!.h})`);
}
