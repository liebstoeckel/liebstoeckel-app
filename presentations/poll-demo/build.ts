import { buildDeck } from "@liebstoeckel/thumbnails/build";

// Builds the single-file deck and embeds slide thumbnails by default.
// Set LIEBSTOECKEL_NO_THUMBS=1 to skip capture (or run anywhere without Chromium).
await buildDeck({ entry: "./index.html", outdir: "./dist" });
