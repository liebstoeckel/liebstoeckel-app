import { buildDeckWithThumbnails } from "@present-it/thumbnails/build";

// Single self-contained file + slide thumbnails (skip with PRESENT_IT_NO_THUMBS=1).
await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
