import { join } from "node:path";
import { buildDeck } from "@liebstoeckel/engine/build";
import { addThumbnailsToFile } from "./index";
import { thumbnailsEnabled, type CaptureOptions } from "./capture";

export interface BuildDeckOptions {
  entry?: string;
  outdir?: string;
  minify?: boolean;
  pkgJson?: string;
}

/** Build a deck and, **by default**, capture + embed thumbnails. Thumbnails are
 *  skipped — with a note, never failing the build — when `LIEBSTOECKEL_NO_THUMBS` is
 *  set or no Chromium is available. A one-line replacement for `buildDeck` in a
 *  deck's `build.ts`. */
export async function buildDeckWithThumbnails(
  build: BuildDeckOptions = {},
  capture: CaptureOptions = {},
): Promise<void> {
  const outdir = build.outdir ?? "./dist";
  await buildDeck(build);
  const out = join(outdir, "index.html");
  console.log(`✓ built ${out}`);

  const { enabled, reason } = thumbnailsEnabled();
  if (!enabled) {
    console.log(`  thumbnails skipped: ${reason}`);
    return;
  }

  const onSlide = capture.onSlide ?? ((i: number, n: number) => process.stderr.write(`\r  thumbnail ${i + 1}/${n}   `));
  try {
    const m = await addThumbnailsToFile(out, { ...capture, onSlide });
    process.stderr.write("\n");
    console.log(`✓ embedded ${Object.keys(m.thumbs).length} thumbnails (${m.w}×${m.h})`);
  } catch (err) {
    // Never fail the build over the optional thumbnail step — the deck is built.
    process.stderr.write("\n");
    console.warn(`⚠ thumbnails skipped: ${(err as Error).message}`);
  }
}
