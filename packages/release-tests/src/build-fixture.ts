// Standalone build entry, run as a subprocess by the harness. Building in a fresh
// `bun` process (rather than calling Bun.build inside `bun test`) avoids a test-
// runner resolver quirk that can't follow the workspace symlinks for a plugin's
// own deps. Invoked with cwd = packages/e2e and the output dir as argv[2].
import { bundleDeck } from "@liebstoeckel/build";

const out = process.argv[2];
if (!out) {
  console.error("usage: build-fixture <outdir>");
  process.exit(1);
}
await bundleDeck({ entry: "./fixture/index.html", outdir: out, pkgJson: "./package.json" });
