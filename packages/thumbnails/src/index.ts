import { captureThumbnails, thumbnailsEnabled, type CaptureOptions } from "./capture";
import { embedThumbnails, type ThumbnailManifest } from "@liebstoeckel/engine/build/thumbnails";

export {
  captureThumbnails,
  renderDeckSlides,
  printDeckPdf,
  resolveChromium,
  hasChromium,
  systemChromiumCandidates,
  thumbnailsEnabled,
  type CaptureOptions,
  type RenderDriveOptions,
  type RenderDriveResult,
  type PrintDriveOptions,
  type PrintDriveResult,
  type ThumbnailFormat,
} from "./capture";
export {
  exportDeck,
  parseSlideRange,
  pdfFromJpegPages,
  type ExportFormat,
  type ExportOptions,
  type ExportResult,
  type JpegPage,
} from "./export";
export {
  embedThumbnails,
  extractThumbnails,
  stripThumbnails,
  type ThumbnailManifest,
} from "@liebstoeckel/engine/build/thumbnails";

export interface WithThumbnailsResult {
  /** the deck HTML, with thumbnails embedded, or unchanged if skipped */
  html: string;
  /** the captured manifest, or null when skipped */
  manifest: ThumbnailManifest | null;
  /** set when capture was skipped; the human-readable reason */
  skipped?: string;
}

/** The canonical, in-memory "add thumbnails to a deck" step: gate → capture →
 *  embed, **graceful and never-fatal**. Returns the deck unchanged (with a
 *  `skipped` reason) when thumbnails are off (`LIEBSTOECKEL_NO_THUMBS`), no Chromium
 *  is available, or capture throws. This is the one place that policy lives, the
 *  build (`buildDeck`) and the live server both route through it.
 *
 *  For an explicit, *loud* capture (fail if no Chromium), use `captureThumbnails` /
 *  `addThumbnailsToFile` instead, e.g. the `thumbs` CLI. */
export async function withThumbnails(html: string, opts: CaptureOptions = {}): Promise<WithThumbnailsResult> {
  const gate = thumbnailsEnabled();
  if (!gate.enabled) return { html, manifest: null, skipped: gate.reason };
  try {
    const manifest = await captureThumbnails(html, opts);
    return { html: embedThumbnails(html, manifest), manifest };
  } catch (err) {
    return { html, manifest: null, skipped: (err as Error).message };
  }
}

/** Capture thumbnails for a built deck file and embed them back into it (in place).
 *  Re-running is idempotent (the prior block is stripped). **Loud**: throws if no
 *  Chromium, for the explicit `thumbs` command. Returns the manifest. */
export async function addThumbnailsToFile(path: string, opts: CaptureOptions = {}): Promise<ThumbnailManifest> {
  const html = await Bun.file(path).text();
  const manifest = await captureThumbnails(html, opts);
  await Bun.write(path, embedThumbnails(html, manifest));
  return manifest;
}
