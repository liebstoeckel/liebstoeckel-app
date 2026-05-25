import { buildDeck } from "@present-it/engine/build";

await buildDeck({ entry: "./index.html", outdir: "./dist" });
console.log("✓ built dist/index.html (single self-contained file)");
