import { buildDeckWithThumbnails } from "@liebstoeckel/thumbnails/build";

// Single self-contained file + slide thumbnails (skip with LIEBSTOECKEL_NO_THUMBS=1).
await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
