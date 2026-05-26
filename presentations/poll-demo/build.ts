import { buildDeckWithThumbnails } from "@present-it/thumbnails/build";

// Builds the single-file deck and embeds slide thumbnails by default.
// Set PRESENT_IT_NO_THUMBS=1 to skip capture (or run anywhere without Chromium).
await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
