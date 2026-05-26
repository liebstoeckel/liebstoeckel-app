import { buildDeck } from "@present-it/engine/build";

await buildDeck({ entry: "./index.html", outdir: "./dist" });
console.log("✓ built dist/index.html");

// Opt-in build-time thumbnails (needs a headless browser, so prod-only).
// `PRESENT_IT_THUMBS=1 bun run build` → overview/presenter use <img> previews.
if (process.env.PRESENT_IT_THUMBS) {
  const { addThumbnailsToFile } = await import("@present-it/thumbnails");
  const m = await addThumbnailsToFile("./dist/index.html", {
    onSlide: (i, n) => process.stderr.write(`\r  thumbnail ${i + 1}/${n}   `),
  });
  process.stderr.write("\n");
  console.log(`✓ embedded ${Object.keys(m.thumbs).length} thumbnails`);
}
