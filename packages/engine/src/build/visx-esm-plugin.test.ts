import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import visxEsmInterop from "./visx-esm-plugin.ts";

// Bundle a deep visx CJS default-import and report whether it resolves to a real
// component (function) or to the namespace object (the oven-sh/bun#12463 bug).
async function deepImportIsFunction(plugins: import("bun").BunPlugin[]): Promise<boolean> {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const dir = mkdtempSync(join(here, ".vt-"));
  try {
    writeFileSync(
      join(dir, "entry.ts"),
      `import Line from "@visx/shape/lib/shapes/Line";\nexport const isFn = typeof Line === "function";\n`,
    );
    await Bun.build({ entrypoints: [join(dir, "entry.ts")], target: "browser", plugins, outdir: dir, naming: "out.js" });
    const mod = (await import(join(dir, "out.js"))) as { isFn: boolean };
    return mod.isFn;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Each case does a real `Bun.build` (bundling visx) — CPU-heavy and slow under
// loaded-CI host load, so give a generous explicit timeout (the default 5s flakes).
const BUILD_TIMEOUT = 60_000;

describe("visx-esm-interop plugin", () => {
  // Documents the underlying Bun.build bug: without the plugin the deep CJS
  // default import is mis-resolved to an object (renders as "Element type is invalid").
  test(
    "baseline: Bun.build mis-resolves the deep CJS default import to an object",
    async () => {
      expect(await deepImportIsFunction([])).toBe(false);
    },
    BUILD_TIMEOUT,
  );

  // The guarantee users/agents rely on: with the plugin, the whole visx surface
  // (grid, heatmap, hierarchy, …) resolves to real components and renders.
  test(
    "with plugin: the deep CJS default import resolves to the real component",
    async () => {
      expect(await deepImportIsFunction([visxEsmInterop])).toBe(true);
    },
    BUILD_TIMEOUT,
  );
});
