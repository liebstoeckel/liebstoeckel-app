import { captureThumbnails, type CaptureOptions } from "./capture";
import { embedThumbnails, type ThumbnailManifest } from "@present-it/engine/build/thumbnails";

export {
  captureThumbnails,
  resolveChromium,
  hasChromium,
  thumbnailsEnabled,
  type CaptureOptions,
  type ThumbnailFormat,
} from "./capture";
export {
  embedThumbnails,
  extractThumbnails,
  stripThumbnails,
  type ThumbnailManifest,
} from "@present-it/engine/build/thumbnails";

/** Capture thumbnails for a built deck file and embed them back into it (in place).
 *  Re-running is idempotent (the prior block is stripped). Returns the manifest. */
export async function addThumbnailsToFile(path: string, opts: CaptureOptions = {}): Promise<ThumbnailManifest> {
  const html = await Bun.file(path).text();
  const manifest = await captureThumbnails(html, opts);
  await Bun.write(path, embedThumbnails(html, manifest));
  return manifest;
}
