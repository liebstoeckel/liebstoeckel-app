import { basename, dirname, join, resolve } from "node:path";
import { bundleDeck, type Generator } from "@liebstoeckel/engine/build";
import { withThumbnails } from "./index";
import type { CaptureOptions } from "./capture";

export interface BuildDeckOptions {
  entry?: string;
  outdir?: string;
  /** Final artifact name within `outdir`. Defaults to `<deck-slug>.html` derived
   *  from the deck folder ((internal ADR)), the same key `liebstoeckel push` upserts by. */
  outfile?: string;
  minify?: boolean;
  pkgJson?: string;
  /** Embed the deck's own source as a recoverable package so the .html is ejectable ((internal ADR)). */
  inlinePackage?: boolean;
  /** Embed third-party license notices computed from the real bundle graph. */
  inlineLicenses?: boolean;
  /** Force the source-embed past its secret gate (loud, explicit). */
  allowSecret?: boolean;
  /** The tool driving the build (e.g. the CLI), recorded in the deck's generator stamp. */
  generator?: Generator;
}

/** `<deck-slug>.html` from the deck folder name (the dir holding `package.json`),
 *  e.g. `…/poll-demo/package.json` → `poll-demo.html`. Mirrors the CLI's deck-key
 *  slugify so the built file and the pushed deck key agree ((internal ADR)/0068). */
function deckHtmlName(pkgJson?: string): string {
  const dir = dirname(resolve(pkgJson ?? "./package.json"));
  const slug =
    basename(dir)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "deck";
  return `${slug}.html`;
}

/** Build a deck to a single self-contained `.html` and, **by default**, capture +
 *  embed slide thumbnails. The batteries-included default a deck's `build.ts` uses, *  it wraps engine's browser-free `bundleDeck` primitive. Thumbnails are skipped,
 *  not failed, when `LIEBSTOECKEL_NO_THUMBS` is set or no Chromium is available
 *  (the policy lives in `withThumbnails`). */
/** What a build produced — returned so callers (e.g. the CLI's `build --json`) can
 *  report a machine-readable result instead of scraping the progress prose. */
export interface BuildDeckResult {
  artifact: string;
  outdir: string;
  outfile: string;
  /** Number of embedded thumbnails, or `null` when capture was skipped. */
  thumbnails: number | null;
  /** Why thumbnails were skipped (e.g. "no Chromium"), when applicable. */
  thumbnailsSkipped?: string;
}

export async function buildDeck(build: BuildDeckOptions = {}, capture: CaptureOptions = {}): Promise<BuildDeckResult> {
  const outdir = build.outdir ?? "./dist";
  const outfile = build.outfile ?? deckHtmlName(build.pkgJson);
  await bundleDeck({ ...build, outfile });
  const out = join(outdir, outfile);
  console.log(`✓ built ${out}`);

  const onSlide = capture.onSlide ?? ((i: number, n: number) => process.stderr.write(`\r  thumbnail ${i + 1}/${n}   `));
  const { html, manifest, skipped } = await withThumbnails(await Bun.file(out).text(), { ...capture, onSlide });
  if (skipped) {
    console.log(`  thumbnails skipped: ${skipped}`);
    return { artifact: out, outdir, outfile, thumbnails: null, thumbnailsSkipped: skipped };
  }
  await Bun.write(out, html);
  process.stderr.write("\n");
  const n = Object.keys(manifest!.thumbs).length;
  console.log(`✓ embedded ${n} thumbnails (${manifest!.w}×${manifest!.h})`);
  return { artifact: out, outdir, outfile, thumbnails: n };
}
